import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasPermission, type Permission, type UserRole } from "@/lib/permissions";

// ─── Super admin guard (US-455) ───────────────────────────────────────────────

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function isSuperAdminEmail(email: string | undefined): boolean {
  if (!email || SUPER_ADMIN_EMAILS.length === 0) return false;
  return SUPER_ADMIN_EMAILS.includes(email.toLowerCase());
}

// ─── Public paths (no auth required) ─────────────────────────────────────────

const PUBLIC_PATHS = ["/login", "/register", "/welcome", "/auth", "/portal", "/candidate-portal", "/extension-auth", "/unsubscribe", "/api/unsubscribe", "/api/webhooks", "/intake", "/api/intake-requests", "/api/client-invites/accept"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// ─── Route → permission requirements ─────────────────────────────────────────

const ROUTE_GUARDS: Array<{ prefix: string; permission: Permission }> = [
  { prefix: "/analytics",          permission: "analytics:view" },
  { prefix: "/settings/billing",   permission: "settings:billing" },
  { prefix: "/settings/audit",     permission: "settings:audit" },
];

// ─── Session timeout constants ────────────────────────────────────────────────

/** US-358: Max inactivity before forced re-auth */
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;         // 30 minutes
/** US-359: Hard cap regardless of activity */
const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours
/** Minimum interval between last_active DB writes (avoids per-request writes) */
const LAST_ACTIVE_UPDATE_INTERVAL_MS = 60 * 1000; // 1 minute

// ─── Session fingerprint ──────────────────────────────────────────────────────

function buildFingerprint(req: NextRequest): string {
  const ua = req.headers.get("user-agent") ?? "";
  const lang = req.headers.get("accept-language") ?? "";
  const raw = `${ua}:${lang}`;
  // Simple non-crypto hash for fingerprint (not used for security, just display)
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = Math.imul(31, h) + raw.charCodeAt(i) | 0;
  return Math.abs(h).toString(16);
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }: { name: string; value: string }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options: CookieOptions }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // ── Super admin guard (US-455): 404 for non-Ikhaya emails ───────────────
  if (pathname.startsWith("/super-admin")) {
    if (!user || !isSuperAdminEmail(user.email)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  if (!user && !isPublic(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && (pathname === "/login" || pathname === "/register")) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/candidates";
    return NextResponse.redirect(dashboardUrl);
  }

  // ── Session tracking + timeout enforcement (US-357/358/359) ──────────────
  if (user) {
    const sessionId = request.cookies.get("ats_session_id")?.value;
    const now = Date.now();

    if (!sessionId) {
      // New login — create a session row
      const { data: newSession } = await supabase
        .from("user_sessions")
        .insert({
          user_id: user.id,
          // agency_id resolved lazily — use a temporary value from users table
          agency_id: await resolveAgencyId(supabase, user.id),
          device_fingerprint: buildFingerprint(request),
          user_agent: request.headers.get("user-agent") ?? null,
          ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        })
        .select("id")
        .single();

      if (newSession?.id) {
        const cookieOpts = {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax" as const,
          maxAge: ABSOLUTE_TIMEOUT_MS / 1000,
          path: "/",
        };
        supabaseResponse.cookies.set("ats_session_id", newSession.id, cookieOpts);
      }
    } else {
      // Existing session — check revocation and timeouts
      const { data: session } = await supabase
        .from("user_sessions")
        .select("revoked_at, session_started_at, last_active")
        .eq("id", sessionId)
        .single();

      if (!session) {
        // Session row gone (deleted or never written) — treat as expired
        return forceSignOut(supabase, supabaseResponse, request, "session_expired");
      }

      if (session.revoked_at) {
        // US-357: Session explicitly revoked
        return forceSignOut(supabase, supabaseResponse, request, "session_revoked");
      }

      const lastActive = new Date(session.last_active).getTime();
      const startedAt = new Date(session.session_started_at).getTime();

      if (now - lastActive > IDLE_TIMEOUT_MS) {
        // US-358: Idle timeout
        await supabase
          .from("user_sessions")
          .update({ revoked_at: new Date().toISOString(), revoke_reason: "idle_timeout" })
          .eq("id", sessionId);
        return forceSignOut(supabase, supabaseResponse, request, "idle_timeout");
      }

      if (now - startedAt > ABSOLUTE_TIMEOUT_MS) {
        // US-359: Absolute timeout
        await supabase
          .from("user_sessions")
          .update({ revoked_at: new Date().toISOString(), revoke_reason: "absolute_timeout" })
          .eq("id", sessionId);
        return forceSignOut(supabase, supabaseResponse, request, "absolute_timeout");
      }

      // Throttled last_active update — at most once per minute
      if (now - lastActive > LAST_ACTIVE_UPDATE_INTERVAL_MS) {
        await supabase
          .from("user_sessions")
          .update({ last_active: new Date().toISOString() })
          .eq("id", sessionId);
      }
    }

    // ── Role-based route guards ────────────────────────────────────────────
    const guard = ROUTE_GUARDS.find((g) => pathname.startsWith(g.prefix));
    if (guard) {
      const { data: userRow } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();

      const role = (userRow?.role ?? null) as UserRole | null;
      if (!hasPermission(role, guard.permission)) {
        const forbidden = request.nextUrl.clone();
        forbidden.pathname = "/candidates";
        return NextResponse.redirect(forbidden);
      }

      supabaseResponse.cookies.set("ats_role", role ?? "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 15 * 60,
        sameSite: "lax",
        path: "/",
      });
    }
  }

  return supabaseResponse;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveAgencyId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("users")
    .select("agency_id")
    .eq("id", userId)
    .single();
  return data?.agency_id ?? null;
}

async function forceSignOut(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  response: NextResponse,
  request: NextRequest,
  reason: string
): Promise<NextResponse> {
  await supabase.auth.signOut();
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("reason", reason);
  const redirect = NextResponse.redirect(loginUrl);
  // Clear the session cookie
  redirect.cookies.set("ats_session_id", "", { maxAge: 0, path: "/" });
  return redirect;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
