/**
 * Candidate Privacy Self-Service Portal — US-353
 * Public route — no auth required.
 * Candidates submit GDPR/CCPA data requests via email token verification.
 */

"use client";

import { useState } from "react";
import { Shield, Mail, CheckCircle2, ChevronDown } from "lucide-react";

const REQUEST_TYPES = [
  { value: "access",        label: "Access — see what data we hold about you" },
  { value: "erasure",       label: "Erasure — request deletion of your data" },
  { value: "portability",   label: "Portability — export your data" },
  { value: "rectification", label: "Rectification — correct inaccurate data" },
  { value: "restriction",   label: "Restriction — limit how we use your data" },
  { value: "objection",     label: "Objection — object to processing" },
];

export default function PrivacyPortalPage({ params }: { params: { agencySlug: string } }) {
  const [step, setStep] = useState<"form" | "submitted" | "check">("form");
  const [form, setForm] = useState({ email: "", requestType: "access", additionalInfo: "" });
  const [statusToken, setStatusToken] = useState("");
  const [checkToken, setCheckToken] = useState("");
  const [requestStatus, setRequestStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email || !form.requestType) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/privacy/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, agencySlug: params.agencySlug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatusToken(data.statusToken);
      setStep("submitted");
    } catch (err: any) {
      setError(err.message ?? "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCheck(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch(`/api/privacy/status?token=${checkToken}`);
      const data = await res.json();
      setRequestStatus(data.status ?? "Not found");
    } catch {
      setRequestStatus("Unable to check status");
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-start justify-center pt-16 px-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-50 mb-4">
            <Shield className="h-6 w-6 text-brand-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Privacy Request</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Exercise your data rights — GDPR / CCPA
          </p>
        </div>

        {step === "submitted" ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-4">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
            <h2 className="text-lg font-semibold text-foreground">Request submitted</h2>
            <p className="text-sm text-muted-foreground">
              Check your email to verify your identity. We'll respond within 30 days.
            </p>
            {statusToken && (
              <div className="bg-muted rounded-lg p-3 text-left">
                <p className="text-xs font-medium text-foreground">Your status reference token:</p>
                <p className="font-mono text-xs text-muted-foreground mt-0.5 break-all">{statusToken}</p>
              </div>
            )}
            <button onClick={() => setStep("form")} className="text-sm text-brand-600 hover:underline">
              Submit another request
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">Your email address</label>
                  <input type="email" required value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-brand-600 bg-card" />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">Request type</label>
                  <select value={form.requestType} onChange={e => setForm(f => ({ ...f, requestType: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-brand-600 bg-card">
                    {REQUEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">Additional information (optional)</label>
                  <textarea rows={3} value={form.additionalInfo}
                    onChange={e => setForm(f => ({ ...f, additionalInfo: e.target.value }))}
                    placeholder="Any context that helps us process your request..."
                    className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-brand-600 bg-card resize-none" />
                </div>
                {error && <p className="text-xs text-red-600">{error}</p>}
                <button type="submit" disabled={submitting || !form.email}
                  className="w-full px-4 py-2.5 bg-brand-600 text-white rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors">
                  {submitting ? "Submitting…" : "Submit request"}
                </button>
              </form>
            </div>

            {/* Status check */}
            <details className="rounded-2xl border border-border bg-card p-6">
              <summary className="flex items-center justify-between cursor-pointer text-sm font-medium text-foreground">
                Check existing request status
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </summary>
              <form onSubmit={handleCheck} className="mt-4 space-y-3">
                <input type="text" value={checkToken}
                  onChange={e => setCheckToken(e.target.value)}
                  placeholder="Paste your status token"
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-brand-600 bg-card" />
                <button type="submit"
                  className="px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-muted/40 transition-colors">
                  Check status
                </button>
                {requestStatus && (
                  <p className="text-sm text-foreground font-medium capitalize">Status: {requestStatus}</p>
                )}
              </form>
            </details>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Powered by Ikhaya · Requests processed in accordance with GDPR / CCPA
        </p>
      </div>
    </div>
  );
}
