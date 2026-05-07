import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { MANAGER_ROLES, isValidEnumValue } from '@/lib/constants';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Simple ZIP creator without external dependencies
function createZip(
  files: Record<string, string | Buffer>
): Buffer {
  const chunks: Buffer[] = [];
  const fileList: {
    name: string;
    content: Buffer;
    crc32: number;
    compressedSize: number;
  }[] = [];

  // Add files
  for (const [name, content] of Object.entries(files)) {
    const buffer =
      typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
    const crc32 = calculateCrc32(buffer);

    fileList.push({
      name,
      content: buffer,
      crc32,
      compressedSize: buffer.length,
    });
  }

  // Write local file headers and data
  let offset = 0;
  for (const file of fileList) {
    const header = createLocalFileHeader(
      file.name,
      file.content.length,
      file.crc32,
      offset
    );
    chunks.push(header);
    chunks.push(file.content);
    offset += header.length + file.content.length;
  }

  const dataSize = Buffer.concat(chunks).length;

  // Write central directory
  let centralDirOffset = dataSize;
  for (const file of fileList) {
    const centralHeader = createCentralDirHeader(
      file.name,
      file.content.length,
      file.crc32,
      centralDirOffset
    );
    chunks.push(centralHeader);
    centralDirOffset += centralHeader.length;
  }

  const centralDirSize = chunks.slice(fileList.length).reduce(
    (sum, buf) => sum + buf.length,
    0
  );

  // Write end of central directory
  chunks.push(
    createEndCentralDir(fileList.length, centralDirSize, dataSize)
  );

  return Buffer.concat(chunks);
}

function calculateCrc32(data: Buffer): number {
  const poly = 0xedb88320;
  let crc = 0xffffffff;

  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ poly : crc >>> 1;
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createLocalFileHeader(
  filename: string,
  size: number,
  crc32: number,
  offset: number
): Buffer {
  const nameBuf = Buffer.from(filename, 'utf-8');
  const buf = Buffer.alloc(30 + nameBuf.length);

  buf.writeUInt32LE(0x04034b50, 0); // local file header signature
  buf.writeUInt16LE(20, 4); // version needed
  buf.writeUInt16LE(0, 6); // flags
  buf.writeUInt16LE(0, 8); // compression method (0 = stored)
  buf.writeUInt16LE(0, 10); // mod time
  buf.writeUInt16LE(0, 12); // mod date
  buf.writeUInt32LE(crc32, 14); // crc-32
  buf.writeUInt32LE(size, 18); // compressed size
  buf.writeUInt32LE(size, 22); // uncompressed size
  buf.writeUInt16LE(nameBuf.length, 26); // filename length
  buf.writeUInt16LE(0, 28); // extra field length

  nameBuf.copy(buf, 30);
  return buf;
}

function createCentralDirHeader(
  filename: string,
  size: number,
  crc32: number,
  localHeaderOffset: number
): Buffer {
  const nameBuf = Buffer.from(filename, 'utf-8');
  const buf = Buffer.alloc(46 + nameBuf.length);

  buf.writeUInt32LE(0x02014b50, 0); // central directory header signature
  buf.writeUInt16LE(20, 4); // version made by
  buf.writeUInt16LE(20, 6); // version needed
  buf.writeUInt16LE(0, 8); // flags
  buf.writeUInt16LE(0, 10); // compression method
  buf.writeUInt16LE(0, 12); // mod time
  buf.writeUInt16LE(0, 14); // mod date
  buf.writeUInt32LE(crc32, 16); // crc-32
  buf.writeUInt32LE(size, 20); // compressed size
  buf.writeUInt32LE(size, 24); // uncompressed size
  buf.writeUInt16LE(nameBuf.length, 28); // filename length
  buf.writeUInt16LE(0, 30); // extra field length
  buf.writeUInt16LE(0, 32); // file comment length
  buf.writeUInt16LE(0, 34); // disk number start
  buf.writeUInt16LE(0, 36); // internal file attributes
  buf.writeUInt32LE(0, 38); // external file attributes
  buf.writeUInt32LE(localHeaderOffset, 42); // relative offset of local header

  nameBuf.copy(buf, 46);
  return buf;
}

function createEndCentralDir(
  fileCount: number,
  centralDirSize: number,
  centralDirOffset: number
): Buffer {
  const buf = Buffer.alloc(22);

  buf.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  buf.writeUInt16LE(0, 4); // disk number
  buf.writeUInt16LE(0, 6); // disk with central directory
  buf.writeUInt16LE(fileCount, 8); // entries on this disk
  buf.writeUInt16LE(fileCount, 10); // total entries
  buf.writeUInt32LE(centralDirSize, 12); // central directory size
  buf.writeUInt32LE(centralDirOffset, 16); // offset of central directory
  buf.writeUInt16LE(0, 20); // comment length

  return buf;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get authenticated user
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // US-322: check role in users table — owner_id check locked out admin-role users
    const { data: userRow, error: userError } = await supabase
      .from('users')
      .select('role, agency_id')
      .eq('id', user.id)
      .single();

    if (userError || !userRow || !isValidEnumValue(userRow.role, MANAGER_ROLES)) {
      return NextResponse.json(
        { error: 'Admin role required to export data' },
        { status: 403 }
      );
    }

    const agencyId = userRow.agency_id;

    // Fetch connections
    const { data: connections } = await supabase
      .from('provider_connections')
      .select('id, provider, provider_email, created_at')
      .eq('agency_id', agencyId);

    // Fetch sync events
    const { data: events } = await supabase
      .from('sync_events')
      .select('*')
      .eq('agency_id', agencyId);

    // Create JSON for connections
    const connectionsJson = JSON.stringify(connections || [], null, 2);

    // US-334: error_message omitted from CSV — raw provider errors frequently
    // contain stack traces, DB paths, and internal service URLs. The taxonomy
    // is captured by error_code; full details remain available in-app via the
    // admin sync_events view which is role-gated and never leaves the browser.
    let eventsCsv = 'id,agency_id,provider,event_type,messages_processed,matches_created,error_code,created_at\n';
    if (events) {
      for (const event of events) {
        const row = [
          event.id,
          event.agency_id,
          event.provider,
          event.event_type,
          event.messages_processed || 0,
          event.matches_created || 0,
          event.error_code || '',
          event.created_at,
        ]
          .map((val) => (typeof val === 'string' ? `"${val}"` : val))
          .join(',');
        eventsCsv += row + '\n';
      }
    }

    // Create ZIP
    const zip = createZip({
      'connections.json': connectionsJson,
      'sync_events.csv': eventsCsv,
    });

    return new NextResponse(zip, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition':
          `attachment; filename="email-export-${Date.now()}.zip"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
