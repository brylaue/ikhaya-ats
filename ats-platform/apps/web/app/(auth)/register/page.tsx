"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Zap, Loader2, Building2, User, ChevronRight, Mail, Eye, EyeOff, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Icons ────────────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

// ─── Agency setup step ────────────────────────────────────────────────────────

function AgencySetupStep() {
  const router   = useRouter();
  const supabase = createClient();

  const [agencyName,   setAgencyName]   = useState("");
  const [fullName,     setFullName]     = useState("");
  const [agencyDomain, setAgencyDomain] = useState("");
  const [loading,      setLoading]      = useState(true); // starts true while checking
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  // On mount: check if user already has an agency, and pre-fill name from OAuth
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push("/login"); return; }

      // Pre-fill full name from OAuth metadata if available
      const oauthName = user.user_metadata?.full_name as string | undefined;
      if (oauthName) setFullName(oauthName);

      // Guard: if this user already has an agency, skip setup entirely
      const { data: existingUser } = await supabase
        .from("users")
        .select("agency_id")
        .eq("id", user.id)
        .single();

      if (existingUser?.agency_id) {
        router.replace("/dashboard");
        return;
      }
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agencyName.trim()) { setError("Agency name is required"); return; }
    if (!fullName.trim())   { setError("Your name is required"); return; }
    setSaving(true); setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("Not authenticated — please sign in first"); setSaving(false); return; }

      const { data: agency, error: agencyErr } = await supabase
        .from("agencies")
        .insert({ name: agencyName.trim(), domain: agencyDomain.trim() || null, plan: "starter" })
        .select("id")
        .single();
      if (agencyErr) throw agencyErr;

      const { error: userErr } = await supabase
        .from("users")
        .upsert({
          id:        user.id,
          agency_id: agency.id,
          email:     user.email ?? "",
          full_name: fullName.trim(),
          role:      "admin",
        });
      if (userErr) throw userErr;

      toast.success("Agency created! Welcome to Ikhaya Talent.");
      router.push("/onboarding");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create agency");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-card rounded-2xl shadow-md border border-border p-8 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/60" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-card rounded-2xl shadow-md border border-border p-8 space-y-5">
      <p className="text-center text-sm text-muted-foreground -mt-1">Almost there — tell us about your agency</p>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-700">{error}</div>
      )}

      <div>
        <label className="block mb-1.5 text-xs font-semibold text-foreground">
          <Building2 className="inline h-3.5 w-3.5 mr-1 -mt-0.5 text-muted-foreground/60" />Agency name
        </label>
        <input
          autoFocus required value={agencyName} onChange={(e) => setAgencyName(e.target.value)}
          placeholder="e.g. Apex Talent Group"
          className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-600 placeholder-gray-400"
        />
      </div>

      <div>
        <label className="block mb-1.5 text-xs font-semibold text-foreground">
          <User className="inline h-3.5 w-3.5 mr-1 -mt-0.5 text-muted-foreground/60" />Your full name
        </label>
        <input
          required value={fullName} onChange={(e) => setFullName(e.target.value)}
          placeholder="e.g. Sarah Johnson"
          className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-600 placeholder-gray-400"
        />
      </div>

      <div>
        <label className="block mb-1.5 text-xs font-semibold text-foreground">
          Agency website domain <span className="font-normal text-muted-foreground/60">(optional)</span>
        </label>
        <input
          value={agencyDomain} onChange={(e) => setAgencyDomain(e.target.value)}
          placeholder="e.g. apextalent.com"
          className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-600 placeholder-gray-400"
        />
      </div>

      <button
        type="submit" disabled={saving}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#1E3C78] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#16306a] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {saving
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <><span>Create agency</span><ChevronRight className="h-4 w-4" /></>
        }
      </button>
    </form>
  );
}

// ─── Sign-up step ─────────────────────────────────────────────────────────────

function SignUpStep() {
  const [mode,     setMode]     = useState<"oauth" | "email">("oauth");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [sent,     setSent]     = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  // ── OAuth ─────────────────────────────────────────────────────────────────

  async function handleGoogleSignIn() {
    setLoading(true); setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/register?step=agency")}`,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
    if (err) { setError(err.message); setLoading(false); }
  }

  async function handleMicrosoftSignIn() {
    setLoading(true); setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/register?step=agency")}`,
        scopes: "email profile openid",
      },
    });
    if (err) { setError(err.message); setLoading(false); }
  }

  // ── Email + password ──────────────────────────────────────────────────────

  async function handleEmailSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim())          { setError("Email is required"); return; }
    if (password.length < 8)    { setError("Password must be at least 8 characters"); return; }
    if (password !== confirm)   { setError("Passwords don't match"); return; }
    setLoading(true); setError(null);

    const supabase = createClient();
    const { error: err } = await supabase.auth.signUp({
      email:    email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/register?step=agency")}`,
      },
    });

    if (err) { setError(err.message); setLoading(false); return; }
    setSent(true);
    setLoading(false);
  }

  // ── Email verification sent screen ───────────────────────────────────────

  if (sent) {
    return (
      <div className="bg-card rounded-2xl shadow-md border border-border p-8 text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50">
          <Mail className="h-6 w-6 text-brand-600" />
        </div>
        <h2 className="text-base font-semibold text-foreground">Check your email</h2>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>.
          Click it to continue setting up your agency.
        </p>
        <button
          onClick={() => setSent(false)}
          className="text-xs text-brand-600 hover:underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl shadow-md border border-border p-8">
      <h2 className="text-center text-base font-semibold text-foreground mb-6">Create your account</h2>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-700">{error}</div>
      )}

      {/* Mode toggle */}
      <div className="mb-5 flex rounded-lg border border-border p-0.5">
        <button
          type="button"
          onClick={() => { setMode("oauth"); setError(null); }}
          className={cn("flex-1 rounded-md py-1.5 text-xs font-medium transition-colors",
            mode === "oauth" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Sign in with SSO
        </button>
        <button
          type="button"
          onClick={() => { setMode("email"); setError(null); }}
          className={cn("flex-1 rounded-md py-1.5 text-xs font-medium transition-colors",
            mode === "email" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Email + password
        </button>
      </div>

      {mode === "oauth" ? (
        <div className="space-y-3">
          <button
            onClick={handleGoogleSignIn} disabled={loading}
            className="w-full flex items-center justify-center gap-2.5 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" /> : <GoogleIcon />}
            Continue with Google
          </button>

          <button
            onClick={handleMicrosoftSignIn} disabled={loading}
            className="w-full flex items-center justify-center gap-2.5 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" /> : <MicrosoftIcon />}
            Continue with Microsoft
          </button>
        </div>
      ) : (
        <form onSubmit={handleEmailSignUp} className="space-y-3">
          <div>
            <label className="block mb-1.5 text-xs font-semibold text-foreground">Work email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
              <input
                type="email" autoFocus required value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@agency.com"
                className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-600 placeholder-gray-400"
              />
            </div>
          </div>

          <div>
            <label className="block mb-1.5 text-xs font-semibold text-foreground">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
              <input
                type={showPw ? "text" : "password"}
                required minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className="w-full rounded-lg border border-border bg-card pl-9 pr-10 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-600 placeholder-gray-400"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block mb-1.5 text-xs font-semibold text-foreground">Confirm password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
              <input
                type={showPw ? "text" : "password"}
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter password"
                className={cn(
                  "w-full rounded-lg border bg-card pl-9 pr-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-600 placeholder-gray-400",
                  confirm && confirm !== password ? "border-red-300 focus:ring-red-400" : "border-border"
                )}
              />
            </div>
          </div>

          <button
            type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#1E3C78] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#16306a] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><span>Create account</span><ChevronRight className="h-4 w-4" /></>}
          </button>
        </form>
      )}

      <div className="mt-6 space-y-2 text-center">
        <p className="text-xs text-muted-foreground/60">
          Already have an account?{" "}
          <a href="/login" className="text-brand-600 hover:underline font-medium">Sign in</a>
        </p>
        <p className="text-xs text-muted-foreground/60">
          By continuing you agree to our{" "}
          <a href="https://ikhaya.io/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-muted-foreground">Terms</a>
          {" "}and{" "}
          <a href="https://ikhaya.io/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-muted-foreground">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}

// ─── Inner router (needs useSearchParams) ─────────────────────────────────────

function RegisterRouter() {
  const searchParams = useSearchParams();
  const step         = searchParams.get("step");

  if (step === "agency") return <AgencySetupStep />;
  return <SignUpStep />;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RegisterPage() {
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
          <RegisterRouter />
        </Suspense>
      </div>
    </div>
  );
}
