/**
 * GET  /api/settings/agency-profile
 * PUT  /api/settings/agency-profile
 *
 * US-482: CAN-SPAM requires every commercial email to carry the sender's
 * physical mailing address. This endpoint lets owners/admins configure the
 * three fields required by the footer builder:
 *   - legal_name
 *   - mailing_address (free-form, multi-line)
 *   - support_email
 *
 * Send-path code reads these from the agency row before every outbound send
 * and refuses to send if `mailing_address` is empty.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { getAgencyContext }          from "@/lib/supabase/agency-cache";
import { checkCsrf }                 from "@/lib/csrf";
import { validateFooterInfo }        from "@/lib/email/footer";

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("agencies")
    .select("name, legal_name, mailing_address, support_email")
    .eq("id", ctx.agencyId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    name:           data.name,
    legalName:      data.legal_name      ?? "",
    mailingAddress: data.mailing_address ?? "",
    supportEmail:   data.support_email   ?? "",
    ready: validateFooterInfo({
      legalName:      data.legal_name ?? "",
      mailingAddress: data.mailing_address ?? "",
      agencyId:       ctx.agencyId,
    }).length === 0,
  });
}

/**
 * PATCH /api/settings/agency-profile
 * Lightweight update used by the onboarding wizard.
 * Accepts any subset of: name, website, can_spam_address, legal_name, mailing_address.
 */
export async function PATCH(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const update: Record<string, unknown> = {};

  if (typeof body.name === "string")             update.name             = body.name.trim().slice(0, 200);
  if (typeof body.website === "string")          update.website          = body.website.trim().slice(0, 500) || null;
  if (typeof body.can_spam_address === "string") update.can_spam_address = body.can_spam_address.trim().slice(0, 500) || null;
  if (typeof body.legal_name === "string")       update.legal_name       = body.legal_name.trim().slice(0, 200);
  if (typeof body.mailing_address === "string")  update.mailing_address  = body.mailing_address.trim().slice(0, 500);

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase
    .from("agencies")
    .update(update)
    .eq("id", ctx.agencyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only owners and admins can edit the public footer.
  if (!["owner", "admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const legalName      = typeof body.legalName === "string"      ? body.legalName.trim().slice(0, 200)     : "";
  const mailingAddress = typeof body.mailingAddress === "string" ? body.mailingAddress.trim().slice(0, 500) : "";
  const supportEmail   = typeof body.supportEmail === "string"   ? body.supportEmail.trim().slice(0, 200)   : "";

  const errs = validateFooterInfo({ legalName, mailingAddress, agencyId: ctx.agencyId });
  if (errs.length > 0) {
    return NextResponse.json({ error: errs.join(" ") }, { status: 400 });
  }

  const { error } = await supabase
    .from("agencies")
    .update({
      legal_name:      legalName,
      mailing_address: mailingAddress,
      support_email:   supportEmail || null,
    })
    .eq("id", ctx.agencyId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
