import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { MANAGER_ROLES, isValidEnumValue } from '@/lib/constants';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
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
        { error: 'Admin role required to purge data' },
        { status: 403 }
      );
    }

    const agencyId = userRow.agency_id;

    // Purge all email data for the agency
    const deletions = {
      email_messages: 0,
      email_threads: 0,
      candidate_email_links: 0,
      sync_events: 0,
    };

    // Delete candidate email links
    const { data: ceLinks } = await supabase
      .from('candidate_email_links')
      .select('id')
      .eq('agency_id', agencyId);
    if (ceLinks) {
      const { error: ceError } = await supabase
        .from('candidate_email_links')
        .delete()
        .eq('agency_id', agencyId);
      if (!ceError) {
        deletions.candidate_email_links = ceLinks.length;
      }
    }

    // Delete email messages
    const { data: msgs } = await supabase
      .from('email_messages')
      .select('id')
      .eq('agency_id', agencyId);
    if (msgs) {
      const { error: msgError } = await supabase
        .from('email_messages')
        .delete()
        .eq('agency_id', agencyId);
      if (!msgError) {
        deletions.email_messages = msgs.length;
      }
    }

    // Delete email threads
    const { data: threads } = await supabase
      .from('email_threads')
      .select('id')
      .eq('agency_id', agencyId);
    if (threads) {
      const { error: threadError } = await supabase
        .from('email_threads')
        .delete()
        .eq('agency_id', agencyId);
      if (!threadError) {
        deletions.email_threads = threads.length;
      }
    }

    // Delete sync events
    const { data: events } = await supabase
      .from('sync_events')
      .select('id')
      .eq('agency_id', agencyId);
    if (events) {
      const { error: eventError } = await supabase
        .from('sync_events')
        .delete()
        .eq('agency_id', agencyId);
      if (!eventError) {
        deletions.sync_events = events.length;
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Email data purged',
        deletions,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Purge error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
