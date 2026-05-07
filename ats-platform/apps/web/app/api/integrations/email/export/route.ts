/**
 * POST /api/integrations/email/export
 *
 * GDPR subject access request. Packages all of the calling user's
 * synced email data into a ZIP (JSON per message) and returns it directly.
 *
 * In v1 this is synchronous (bodies stored inline in DB).
 * v1.1 will enqueue a job, upload to S3, and email a signed URL.
 *
 * Stage 10.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Minimal ZIP builder — just store entries uncompressed.
// Good enough for JSON payloads up to a few MB.
function buildZip(
  entries: { name: string; data: Uint8Array }[]
): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const centralEntries: {
    name: Uint8Array;
    offset: number;
    size: number;
    crc32: number;
  }[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);
    const size = entry.data.length;
    const crc = crc32(entry.data);

    // Local file header (30 + nameLen bytes)
    const header = new ArrayBuffer(30 + nameBytes.length);
    const hv = new DataView(header);
    hv.setUint32(0, 0x04034b50, true); // signature
    hv.setUint16(4, 20, true); // version needed
    hv.setUint16(6, 0, true); // flags
    hv.setUint16(8, 0, true); // compression (store)
    hv.setUint16(10, 0, true); // mod time
    hv.setUint16(12, 0, true); // mod date
    hv.setUint32(14, crc, true); // crc-32
    hv.setUint32(18, size, true); // compressed size
    hv.setUint32(22, size, true); // uncompressed size
    hv.setUint16(26, nameBytes.length, true);
    hv.setUint16(28, 0, true); // extra field length
    new Uint8Array(header).set(nameBytes, 30);

    centralEntries.push({ name: nameBytes, offset, size, crc32: crc });

    const headerArr = new Uint8Array(header);
    parts.push(headerArr);
    parts.push(entry.data);
    offset += headerArr.length + size;
  }

  // Central directory
  const cdStart = offset;
  for (const ce of centralEntries) {
    const cd = new ArrayBuffer(46 + ce.name.length);
    const cv = new DataView(cd);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0, true); // flags
    cv.setUint16(10, 0, true); // compression
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, ce.crc32, true);
    cv.setUint32(20, ce.size, true);
    cv.setUint32(24, ce.size, true);
    cv.setUint16(28, ce.name.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, ce.offset, true);
    new Uint8Array(cd).set(ce.name, 46);
    const cdArr = new Uint8Array(cd);
    parts.push(cdArr);
    offset += cdArr.length;
  }

  // End of central directory
  const eocd = new ArrayBuffer(22);
  const ev = new DataView(eocd);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, centralEntries.length, true);
  ev.setUint16(10, centralEntries.length, true);
  ev.setUint32(12, offset - cdStart, true);
  ev.setUint32(16, cdStart, true);
  ev.setUint16(20, 0, true);
  parts.push(new Uint8Array(eocd));

  // Concat
  const totalSize = parts.reduce((s, p) => s + p.length, 0);
  const result = new Uint8Array(totalSize);
  let pos = 0;
  for (const p of parts) {
    result.set(p, pos);
    pos += p.length;
  }
  return result;
}

// Simple CRC-32 (no external deps)
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's agency
  const { data: userRow } = await supabase
    .from("users")
    .select("agency_id")
    .eq("id", user.id)
    .single();

  if (!userRow) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    // Fetch all messages for this user
    const { data: messages } = await supabase
      .from("email_messages")
      .select(
        "id, provider, provider_message_id, direction, from_address, to_addresses, cc_addresses, subject, snippet, body_text, body_html, sent_at, has_attachments"
      )
      .eq("user_id", user.id)
      .order("sent_at", { ascending: false });

    // Fetch connections (no tokens)
    const { data: connections } = await supabase
      .from("provider_connections")
      .select("id, provider, email, sync_enabled, created_at")
      .eq("user_id", user.id);

    // Fetch candidate links
    const { data: links } = await supabase
      .from("candidate_email_links")
      .select("id, candidate_id, message_id, match_strategy, match_confidence, status")
      .eq("agency_id", userRow.agency_id);

    // Build ZIP entries — one JSON file per message + a manifest
    const enc = new TextEncoder();
    const zipEntries: { name: string; data: Uint8Array }[] = [];

    // Manifest
    const manifest = {
      exportedAt: new Date().toISOString(),
      userId: user.id,
      userEmail: user.email,
      totalMessages: messages?.length ?? 0,
      totalConnections: connections?.length ?? 0,
    };
    zipEntries.push({
      name: "manifest.json",
      data: enc.encode(JSON.stringify(manifest, null, 2)),
    });

    // Connections
    zipEntries.push({
      name: "connections.json",
      data: enc.encode(JSON.stringify(connections ?? [], null, 2)),
    });

    // Messages — batch into files of 100 for large exports
    const msgs = messages ?? [];
    if (msgs.length <= 100) {
      zipEntries.push({
        name: "messages.json",
        data: enc.encode(JSON.stringify(msgs, null, 2)),
      });
    } else {
      for (let i = 0; i < msgs.length; i += 100) {
        const batch = msgs.slice(i, i + 100);
        zipEntries.push({
          name: `messages_${Math.floor(i / 100) + 1}.json`,
          data: enc.encode(JSON.stringify(batch, null, 2)),
        });
      }
    }

    // Links
    if (links && links.length > 0) {
      zipEntries.push({
        name: "candidate_links.json",
        data: enc.encode(JSON.stringify(links, null, 2)),
      });
    }

    const zip = buildZip(zipEntries);

    // Record export event
    await supabase.from("sync_events").insert({
      user_id: user.id,
      agency_id: userRow.agency_id,
      provider: "google", // generic
      event_type: "data_export",
      messages_processed: msgs.length,
      matches_created: 0,
    });

    return new NextResponse(zip, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="email-export-${Date.now()}.zip"`,
      },
    });
  } catch (err) {
    console.error("[export] Error:", err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
