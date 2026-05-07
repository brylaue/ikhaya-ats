"use client";

/**
 * /intake/[token] — US-476: Public intake form for hiring managers.
 *
 * No authentication required. The recruiter shares this URL with a
 * hiring manager (client) who fills out role requirements. On submit,
 * the intake_request transitions from "pending" → "submitted" and the
 * recruiter can then convert the submission into a job posting.
 */

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Loader as Loader2, CircleCheck as CheckCircle2, CircleAlert as AlertCircle, Send, Building2 } from "lucide-react";

interface IntakeMeta {
  id:        string;
  status:    string;
  prefill:   Record<string, unknown>;
  expiresAt: string;
  company?:  { id: string; name: string } | null;
}

const WORK_TYPES = ["On-site", "Hybrid", "Remote"] as const;
const LEVELS     = ["Junior", "Mid-level", "Senior", "Lead", "Principal", "Director", "VP", "C-Suite"] as const;
const EMP_TYPES  = ["Full-time", "Part-time", "Contract", "Interim"] as const;

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const INPUT = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent";
const SELECT = `${INPUT} bg-white`;
const TEXTAREA = `${INPUT} resize-none`;

export default function IntakePage() {
  const params = useParams<{ token: string }>();
  const [meta,       setMeta]       = useState<IntakeMeta | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [submitted,  setSubmitted]  = useState(false);
  const [saving,     setSaving]     = useState(false);

  // Form fields
  const [jobTitle,      setJobTitle]      = useState("");
  const [department,    setDepartment]    = useState("");
  const [location,      setLocation]      = useState("");
  const [workType,      setWorkType]      = useState<string>("");
  const [employmentType,setEmploymentType]= useState<string>("");
  const [level,         setLevel]         = useState<string>("");
  const [salaryMin,     setSalaryMin]     = useState("");
  const [salaryMax,     setSalaryMax]     = useState("");
  const [description,   setDescription]   = useState("");
  const [mustHaves,     setMustHaves]     = useState("");
  const [niceToHaves,   setNiceToHaves]   = useState("");
  const [headcount,     setHeadcount]     = useState("1");
  const [targetStart,   setTargetStart]   = useState("");
  const [hiringManager, setHiringManager] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");

  useEffect(() => {
    fetch(`/api/intake-requests/${params.token}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? "Invalid or expired link.");
          return;
        }
        const data = await res.json() as IntakeMeta;
        setMeta(data);

        // Pre-fill from recruiter-provided defaults
        const p = data.prefill ?? {};
        if (p.jobTitle)       setJobTitle(p.jobTitle as string);
        if (p.department)     setDepartment(p.department as string);
        if (p.location)       setLocation(p.location as string);
        if (p.workType)       setWorkType(p.workType as string);
        if (p.employmentType) setEmploymentType(p.employmentType as string);
        if (p.level)          setLevel(p.level as string);
        if (p.salaryMin)      setSalaryMin(String(p.salaryMin));
        if (p.salaryMax)      setSalaryMax(String(p.salaryMax));
        if (p.description)    setDescription(p.description as string);
        if (p.headcount)      setHeadcount(String(p.headcount));
      })
      .catch(() => setError("Failed to load form. Please check the URL and try again."))
      .finally(() => setLoading(false));
  }, [params.token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!jobTitle.trim()) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/intake-requests/${params.token}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle:       jobTitle.trim(),
          department:     department.trim() || undefined,
          location:       location.trim()   || undefined,
          workType:       workType          || undefined,
          employmentType: employmentType    || undefined,
          level:          level             || undefined,
          salaryMin:      salaryMin ? Number(salaryMin) : undefined,
          salaryMax:      salaryMax ? Number(salaryMax) : undefined,
          description:    description.trim()      || undefined,
          mustHaves:      mustHaves.trim()         || undefined,
          niceToHaves:    niceToHaves.trim()       || undefined,
          headcount:      headcount ? Number(headcount) : 1,
          targetStart:    targetStart               || undefined,
          hiringManager:  hiringManager.trim()      || undefined,
          additionalNotes:additionalNotes.trim()    || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Submission failed. Please try again.");
        return;
      }

      setSubmitted(true);
    } finally {
      setSaving(false);
    }
  }

  // ── States ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center space-y-4">
          <div className="flex justify-center">
            <div className="rounded-full bg-red-100 p-4">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
          </div>
          <h1 className="text-lg font-bold text-gray-900">Link Unavailable</h1>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center space-y-4">
          <div className="flex justify-center">
            <div className="rounded-full bg-emerald-100 p-4">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
          </div>
          <h1 className="text-lg font-bold text-gray-900">Thank you!</h1>
          <p className="text-sm text-gray-500">
            Your request has been received. Your recruiter will be in touch shortly.
          </p>
        </div>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 rounded-xl bg-violet-600 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Job Requisition Form</h1>
          {meta?.company && (
            <p className="text-sm text-gray-500 mt-1">for {meta.company.name}</p>
          )}
          <p className="text-sm text-gray-400 mt-2">
            Please fill in the details below so we can find you the right candidate.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-6">

          {/* Role basics */}
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-800 border-b border-gray-100 pb-2">Role Details</h2>

            <Field label="Job Title" required>
              <input
                value={jobTitle}
                onChange={e => setJobTitle(e.target.value)}
                placeholder="e.g. Senior Product Manager"
                required
                className={INPUT}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Department">
                <input
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
                  placeholder="e.g. Engineering"
                  className={INPUT}
                />
              </Field>
              <Field label="Seniority Level">
                <select value={level} onChange={e => setLevel(e.target.value)} className={SELECT}>
                  <option value="">Select level…</option>
                  {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Employment Type">
                <select value={employmentType} onChange={e => setEmploymentType(e.target.value)} className={SELECT}>
                  <option value="">Select type…</option>
                  {EMP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Work Arrangement">
                <select value={workType} onChange={e => setWorkType(e.target.value)} className={SELECT}>
                  <option value="">Select…</option>
                  {WORK_TYPES.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </Field>
            </div>

            <Field label="Location">
              <input
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="e.g. New York, NY or Remote"
                className={INPUT}
              />
            </Field>
          </div>

          {/* Compensation */}
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-800 border-b border-gray-100 pb-2">Compensation</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Salary Min (USD)">
                <input
                  type="number"
                  value={salaryMin}
                  onChange={e => setSalaryMin(e.target.value)}
                  placeholder="e.g. 120000"
                  min={0}
                  className={INPUT}
                />
              </Field>
              <Field label="Salary Max (USD)">
                <input
                  type="number"
                  value={salaryMax}
                  onChange={e => setSalaryMax(e.target.value)}
                  placeholder="e.g. 160000"
                  min={0}
                  className={INPUT}
                />
              </Field>
            </div>
          </div>

          {/* Requirements */}
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-800 border-b border-gray-100 pb-2">Requirements</h2>

            <Field label="Role Overview">
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Brief description of the role and its responsibilities…"
                rows={4}
                className={TEXTAREA}
              />
            </Field>

            <Field label="Must-Have Skills / Qualifications">
              <textarea
                value={mustHaves}
                onChange={e => setMustHaves(e.target.value)}
                placeholder="List key requirements, one per line…"
                rows={3}
                className={TEXTAREA}
              />
            </Field>

            <Field label="Nice-to-Have Skills">
              <textarea
                value={niceToHaves}
                onChange={e => setNiceToHaves(e.target.value)}
                placeholder="List preferred but not essential skills, one per line…"
                rows={3}
                className={TEXTAREA}
              />
            </Field>
          </div>

          {/* Logistics */}
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-800 border-b border-gray-100 pb-2">Logistics</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Headcount">
                <input
                  type="number"
                  value={headcount}
                  onChange={e => setHeadcount(e.target.value)}
                  min={1}
                  className={INPUT}
                />
              </Field>
              <Field label="Target Start Date">
                <input
                  type="date"
                  value={targetStart}
                  onChange={e => setTargetStart(e.target.value)}
                  className={INPUT}
                />
              </Field>
            </div>

            <Field label="Hiring Manager Name / Email">
              <input
                value={hiringManager}
                onChange={e => setHiringManager(e.target.value)}
                placeholder="Jane Smith / jane@company.com"
                className={INPUT}
              />
            </Field>

            <Field label="Additional Notes">
              <textarea
                value={additionalNotes}
                onChange={e => setAdditionalNotes(e.target.value)}
                placeholder="Anything else we should know about this role or the ideal candidate…"
                rows={3}
                className={TEXTAREA}
              />
            </Field>
          </div>

          <button
            type="submit"
            disabled={saving || !jobTitle.trim()}
            className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-semibold py-3 rounded-lg transition-colors text-sm"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {saving ? "Submitting…" : "Submit Request"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          This form was shared with you by your recruiter. Your information is kept confidential.
        </p>
      </div>
    </div>
  );
}
