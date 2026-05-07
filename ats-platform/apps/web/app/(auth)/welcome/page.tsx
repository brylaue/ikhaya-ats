"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Loader2, User, ChevronRight, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ─── Welcome / Invited‑user setup page ───────────────────────────────────────
//
// Reached after an invited user clicks their magic‑link email and lands at
// /auth/callback?next=/welcome. By this point Supabase has already exchanged
// the code for a session, so we have auth.getUser() available.
//
// What we do here:
//  1. Load the current session — if none, redirect to /login.
//  2. If the user already has a `users` row (agency_id set), redirect to /candidates.
//  3. Otherwise, read agency_id + role from user_metadata (set during invite).
//  4. Let them confirm / change their display name.
//  5. Upsert a `users` row, linking them to the agency.

function WelcomeForm() {
  const router = useRouter();

  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [done,      setDone]      = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  // Pre-filled from OAuth / invite metadata
  const [fullName,  setFullName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [agencyId,  setAgencyId]  = useState<string | null>(null);
  const [role,      setRole]      = useState("recruiter");
  const [inviterName, setInviterName] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      setEmail(user.email ?? "");

      // Check if they already have a users row (e.g. returning to this page)
      const { data: existingRow } = await supabase
        .from("users")
        .select("agency_id")
        .eq("id", user.id)
        .maybeSingle();

      if (existingRow?.agency_id) {
        router.replace("/candidates");
        return;
      }

      // Read invite metadata
      const meta = user.user_metadata ?? {};
      setAgencyId(meta.agency_id ?? null);
      setRole(meta.role ?? "recruiter");
      setFullName(meta.full_name ?? meta.name ?? "");
      setInviterName(meta.inviter_name ?? null);

      if (!meta.agency_id) {
        setError("This invite link appears to be invalid or has expired. Please ask your team admin to resend it.");
      }

      setLoading(false);
    })();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) { setError("Please enter your name"); return; }
    if (!agencyId)        { setError("Invalid invitation — no agency found"); return; }
    setSaving(true); setError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }

    // Upsert users row linking them to the agency
    const { error: upsertErr } = await supabase.from("users").upsert({
      id:        user.id,
      email:     user.email,
      full_name: fullName.trim(),
      agency_id: agencyId,
      role,
      is_active: true,
    }, { onConflict: "id" });

    if (upsertErr) {
      setError(upsertErr.message);
      setSaving(false);
      return;
    }

    // Update auth display name so it shows up everywhere
    await supabase.auth.updateUser({ data: { full_name: fullName.trim() } });

    setDone(true);
    setTimeout(() => router.replace("/candidates"), 1200);
  }

  if (loading) {
    return (
      <div className="bg-card rounded-2xl shadow-md border border-border p-8 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/60" />
      </div>
    );
  }

  if (done) {
    return (
      <div className="bg-card rounded-2xl shadow-md border border-border p-8 text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
          <Check className="h-6 w-6 text-emerald-600" />
        </div>
        <h2 className="text-base font-semibold text-foreground">You&apos;re all set!</h2>
        <p className="text-sm text-muted-foreground">Redirecting you to the dashboard…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-card rounded-2xl shadow-md border border-border p-8 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Welcome to the team!</h2>
        {inviterName ? (
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{inviterName}</span> invited you to join their agency on Ikhaya Talent.
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">Complete your profile to get started.</p>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-700">{error}</div>
      )}

      {/* Email (read-only) */}
      <div>
        <label className="block mb-1.5 text-xs font-semibold text-foreground">Email</label>
        <input
          readOnly
          value={email}
          className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground outline-none cursor-not-allowed"
        />
      </div>

      {/* Full name */}
      <div>
        <label className="block mb-1.5 text-xs font-semibold text-foreground">
          Your name <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
          <input
            type="text"
            autoFocus
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Smith"
            className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-600 placeholder-gray-400"
          />
        </div>
      </div>

      {/* Role (display only — set by inviter) */}
      <div>
        <label className="block mb-1.5 text-xs font-semibold text-foreground">Your role</label>
        <div className="rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground capitalize">
          {role.replace(/_/g, " ")}
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground/60">Assigned by your team admin — they can change it later</p>
      </div>

      <button
        type="submit"
        disabled={saving || !agencyId}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#1E3C78] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#16306a] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {saving
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <><span>Join the team</span><ChevronRight className="h-4 w-4" /></>
        }
      </button>
    </form>
  );
}

export default function WelcomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-white p-4">
      <div className="w-full max-w-sm mx-auto">
        <div className="text-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#1E3C78] shadow-sm mx-auto mb-4">
            <Zap className="h-6 w-6 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Ikhaya Talent</h1>
          <p className="text-sm text-muted-foreground mt-1">Agency recruiting, reimagined</p>
        </div>

        <Suspense fallback={
          <div className="bg-card rounded-2xl shadow-md border border-border p-8 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/60" />
          </div>
        }>
          <WelcomeForm />
        </Suspense>
      </div>
    </div>
  );
}
