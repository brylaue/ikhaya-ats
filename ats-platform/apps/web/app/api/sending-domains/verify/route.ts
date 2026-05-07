/**
 * POST /api/sending-domains/verify
 * US-471: Trigger DNS verification check for a sending domain.
 *
 * In production this would call the Postmark/SendGrid domain verification API.
 * Here we perform live DNS lookups via the `dns` module to check SPF and DMARC.
 *
 * Body: { domainId: string }
 * Response: {
 *   verified: boolean;
 *   checks: { spf: boolean; dkim: boolean; dmarc: boolean };
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { getAgencyContext }           from "@/lib/supabase/agency-cache";
import { checkCsrf }                  from "@/lib/csrf";
import dns                            from "node:dns/promises";

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { domainId?: string };
  if (!body.domainId) return NextResponse.json({ error: "domainId is required" }, { status: 400 });

  // Load the domain record
  const { data: domain } = await supabase
    .from("sending_domains")
    .select("*")
    .eq("id", body.domainId)
    .eq("agency_id", ctx.agencyId)
    .single();

  if (!domain) return NextResponse.json({ error: "Domain not found" }, { status: 404 });

  // ── DNS checks ──────────────────────────────────────────────────────────────

  const checks = { spf: false, dkim: false, dmarc: false };

  try {
    // SPF: look for the expected record in TXT records for the domain
    const txtRecords = await dns.resolveTxt(domain.domain).catch(() => []);
    const flatTxt    = txtRecords.map((r: string[]) => r.join("")).join(" ");
    checks.spf = flatTxt.includes("v=spf1") && flatTxt.includes("postmarkapp.com");

    // DKIM: look for selector._domainkey TXT record
    const dkimName    = `${domain.dkim_selector}._domainkey.${domain.domain}`;
    const dkimRecords = await dns.resolveTxt(dkimName).catch(() => []);
    const dkimFlat    = dkimRecords.map((r: string[]) => r.join("")).join(" ");
    checks.dkim = dkimFlat.includes("v=DKIM1");

    // DMARC: look for _dmarc TXT record
    const dmarcName    = `_dmarc.${domain.domain}`;
    const dmarcRecords = await dns.resolveTxt(dmarcName).catch(() => []);
    const dmarcFlat    = dmarcRecords.map((r: string[]) => r.join("")).join(" ");
    checks.dmarc = dmarcFlat.includes("v=DMARC1");
  } catch {
    // DNS resolution failure — verification fails gracefully
  }

  const verified = checks.spf && checks.dkim && checks.dmarc;

  // Update record if newly verified
  if (verified && !domain.verified) {
    await supabase
      .from("sending_domains")
      .update({ verified: true, verified_at: new Date().toISOString() })
      .eq("id", domain.id);
  }

  return NextResponse.json({ verified, checks });
}
