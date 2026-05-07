import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { gmailAdapter } from '@/lib/email/gmail-adapter';
import { graphAdapter } from '@/lib/email/graph-adapter';

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

    // Check if user is agency owner — select id for agency scoping (US-318)
    const { data: agency, error: agencyError } = await supabase
      .from('agencies')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (agencyError || !agency) {
      return NextResponse.json(
        { error: 'Only agency owners can disconnect users' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { userId, provider } = body;

    if (!userId || !provider) {
      return NextResponse.json(
        { error: 'Missing userId or provider' },
        { status: 400 }
      );
    }

    // Find connection — must belong to caller's agency (US-318: IDOR fix)
    const { data: connection, error: connError } = await supabase
      .from('provider_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', provider)
      .eq('agency_id', agency.id)
      .single();

    if (connError || !connection) {
      return NextResponse.json(
        { error: 'Connection not found' },
        { status: 404 }
      );
    }

    // Revoke token with appropriate adapter
    const adapter = provider === 'google' ? gmailAdapter : graphAdapter;
    try {
      await adapter.revoke(connection);
    } catch (error) {
      console.error('Error revoking token:', error);
    }

    // Delete connection
    const { error: deleteError } = await supabase
      .from('provider_connections')
      .delete()
      .eq('id', connection.id);

    if (deleteError) {
      return NextResponse.json(
        { error: 'Failed to delete connection' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, message: 'Connection disconnected' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Disconnect error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
