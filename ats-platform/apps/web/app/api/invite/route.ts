import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { MANAGER_ROLES, INVITABLE_ROLES, isValidEmail, isValidEnumValue, INVITE_RATE_LIMIT_MS } from "@/lib/constants";

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAdminKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// ─── POST /api/invite ─────────────────────────────────────────────────────────
// Body: { email: string; role: string }
// Auth: Bearer <access_token> — caller must be owner or admin of their agency

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate caller
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const accessToken = authHeader.slice(7);

    const supabaseAdmin = createClient(supabaseUrl, supabaseAdminKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user: caller }, error: authErr } =
      await supabaseAdmin.auth.getUser(accessToken);
    if (authErr || !caller) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Get caller's agency + role
    const { data: callerRow, error: callerErr } = await supabaseAdmin
      .from("users")
      .select("agency_id, role, full_name, email")
      .eq("id", caller.id)
      .single();

    if (callerErr || !callerRow?.agency_id) {
      return NextResponse.json({ error: "No agency found" }, { status: 403 });
    }

    if (!isValidEnumValue(callerRow.role, MANAGER_ROLES)) {
      return NextResponse.json(
        { error: "Only owners and admins can invite team members" },
        { status: 403 }
      );
    }

    // 3. Parse body
    const body = await req.json();
    const email: string = (body.email ?? "").trim().toLowerCase();
    const role: string  = body.role ?? "recruiter";

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }
    if (email.length > 254) {
      return NextResponse.json({ error: "Email address too long" }, { status: 400 });
    }

    if (!isValidEnumValue(role, INVITABLE_ROLES)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // 4. Check this email isn't already on the team
    const { data: existing } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("agency_id", callerRow.agency_id)
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "This person is already on your team" },
        { status: 409 }
      );
    }

    // 5. Check for a recent pending invite to this email
    const { data: recentInvite } = await supabaseAdmin
      .from("team_invitations")
      .select("id, created_at")
      .eq("agency_id", callerRow.agency_id)
      .eq("email", email)
      .is("accepted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentInvite) {
      const age = Date.now() - new Date(recentInvite.created_at).getTime();
      if (age < INVITE_RATE_LIMIT_MS) {
        return NextResponse.json(
          { error: "An invite was already sent to this address in the last 24 hours" },
          { status: 429 }
        );
      }
    }

    // 6. Record the invitation
    const origin = req.headers.get("origin") ?? req.nextUrl.origin;
    const { data: invitation, error: insertErr } = await supabaseAdmin
      .from("team_invitations")
      .insert({
        agency_id:  callerRow.agency_id,
        email,
        role,
        invited_by: caller.id,
      })
      .select("id")
      .single();

    if (insertErr || !invitation) {
      console.error("[invite] insert error:", insertErr);
      return NextResponse.json({ error: "Failed to create invitation" }, { status: 500 });
    }

    // 7. Send the invite via Supabase auth (magic link email)
    const { error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/auth/callback?next=/welcome`,
      data: {
        agency_id:      callerRow.agency_id,
        role,
        invited_by:     caller.id,
        inviter_name:   callerRow.full_name ?? callerRow.email,
        invitation_id:  invitation.id,
      },
    });

    if (inviteErr) {
      // If user already exists in auth, Supabase returns an error — handle gracefully
      if (inviteErr.message?.toLowerCase().includes("already registered")) {
        // Delete the invite record we just created; they should log in instead
        await supabaseAdmin
          .from("team_invitations")
          .delete()
          .eq("id", invitation.id);
        return NextResponse.json(
          { error: "This email already has an account — ask them to log in" },
          { status: 409 }
        );
      }
      console.error("[invite] supabase invite error:", inviteErr);
      // Clean up the invite record
      await supabaseAdmin.from("team_invitations").delete().eq("id", invitation.id);
      return NextResponse.json({ error: inviteErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, invitationId: invitation.id });
  } catch (err) {
    console.error("[invite] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── GET /api/invite — list pending invitations for the caller's agency ───────

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const accessToken = authHeader.slice(7);

    const supabaseAdmin = createClient(supabaseUrl, supabaseAdminKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user: caller }, error: authErr } =
      await supabaseAdmin.auth.getUser(accessToken);
    if (authErr || !caller) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: callerRow } = await supabaseAdmin
      .from("users")
      .select("agency_id")
      .eq("id", caller.id)
      .single();

    if (!callerRow?.agency_id) {
      return NextResponse.json({ invitations: [] });
    }

    const { data: invitations, error } = await supabaseAdmin
      .from("team_invitations")
      .select("id, email, role, invited_by, created_at, accepted_at")
      .eq("agency_id", callerRow.agency_id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ invitations: invitations ?? [] });
  } catch (err) {
    console.error("[invite GET] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── DELETE /api/invite?id=xxx — revoke a pending invitation ─────────────────

export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const accessToken = authHeader.slice(7);
    const inviteId = req.nextUrl.searchParams.get("id");
    if (!inviteId) {
      return NextResponse.json({ error: "Missing invite id" }, { status: 400 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseAdminKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user: caller }, error: authErr } =
      await supabaseAdmin.auth.getUser(accessToken);
    if (authErr || !caller) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: callerRow } = await supabaseAdmin
      .from("users")
      .select("agency_id, role")
      .eq("id", caller.id)
      .single();

    if (!callerRow?.agency_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Only owner/admin can revoke
    if (!isValidEnumValue(callerRow.role, MANAGER_ROLES)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from("team_invitations")
      .delete()
      .eq("id", inviteId)
      .eq("agency_id", callerRow.agency_id); // safety: only delete own agency invites

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[invite DELETE] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
