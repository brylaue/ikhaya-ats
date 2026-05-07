"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Star, Loader2, ExternalLink, MapPin,
  Briefcase, Mail, Phone, Linkedin, Trophy, ThumbsUp, Minus,
} from "lucide-react";
import { cn, generateAvatarColor, getInitials, formatSalary } from "@/lib/utils";
import { useCandidates } from "@/lib/supabase/hooks";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { Candidate } from "@/types";

// ─── Field definitions ─────────────────────────────────────────────────────────

interface CompareField {
  key:    string;
  label:  string;
  get:    (c: Candidate) => string | number | null | undefined;
  format?: (v: string | number | null | undefined) => string;
  type?:  "text" | "salary" | "tags" | "skills";
}

const FIELDS: CompareField[] = [
  { key: "currentTitle",   label: "Current Title",   get: (c) => c.currentTitle },
  { key: "currentCompany", label: "Company",          get: (c) => c.currentCompany },
  {
    key: "location", label: "Location",
    get: (c) => {
      const l = c.location;
      if (!l) return null;
      return [l.city, l.state, l.country].filter(Boolean).join(", ");
    },
  },
  { key: "status",   label: "Status",   get: (c) => c.status?.replace(/_/g, " ") },
  { key: "source",   label: "Source",   get: (c) => c.source },
  {
    key: "desiredSalary", label: "Desired Salary",
    get: (c) => c.desiredSalary ?? null,
    format: (v) => v != null ? formatSalary(Number(v)) : "—",
  },
  { key: "openToRemote", label: "Open to Remote", get: (c) => c.openToRemote ? "Yes" : "No" },
  { key: "linkedinUrl",  label: "LinkedIn",        get: (c) => c.linkedinUrl },
  { key: "summary",      label: "Summary",         get: (c) => c.summary },
];

// ─── Ranking button ────────────────────────────────────────────────────────────

const RANKINGS = [
  { value: 1, label: "Top pick",  icon: Trophy,   color: "text-yellow-600 bg-yellow-50 border-yellow-200" },
  { value: 2, label: "Shortlist", icon: ThumbsUp,  color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  { value: 3, label: "Consider",  icon: Star,      color: "text-brand-600 bg-brand-50 border-brand-200" },
  { value: 0, label: "Pass",      icon: Minus,     color: "text-muted-foreground bg-muted/50 border-border" },
];

// ─── Comparison table ─────────────────────────────────────────────────────────

function CompareTable({ candidates }: { candidates: Candidate[] }) {
  const [rankings, setRankings]   = useState<Record<string, number>>({});
  const [saving, setSaving]       = useState<Record<string, boolean>>({});

  const colCount = candidates.length;
  const gridCols = colCount === 2 ? "grid-cols-[180px_1fr_1fr]"
    : colCount === 3 ? "grid-cols-[180px_1fr_1fr_1fr]"
    : "grid-cols-[180px_1fr_1fr_1fr_1fr]";

  // Which fields differ across the selected candidates?
  const { diffFields } = useMemo(() => {
    const diffFields = new Set<string>();
    for (const field of FIELDS) {
      const vals = candidates.map((c) => {
        const v = field.get(c);
        return field.format ? field.format(v) : (v ?? "—");
      });
      if (new Set(vals).size > 1) diffFields.add(field.key);
    }
    return { diffFields };
  }, [candidates]);

  async function saveRanking(candidateId: string, rank: number) {
    setSaving((p) => ({ ...p, [candidateId]: true }));
    setRankings((p) => ({ ...p, [candidateId]: rank }));

    const supabase = createClient();
    // Log as a note/annotation on the candidate — stored in a lightweight way
    await supabase.from("candidate_notes").insert({
      candidate_id: candidateId,
      body: `Comparison ranking: ${RANKINGS.find((r) => r.value === rank)?.label ?? rank}`,
      note_type: "ranking",
    }).then(({ error }) => {
      if (error) toast.error("Could not save ranking");
      else toast.success("Ranking saved");
    });

    setSaving((p) => ({ ...p, [candidateId]: false }));
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      {/* Candidate header row */}
      <div className={cn("grid border-b border-border", gridCols)}>
        {/* Empty corner */}
        <div className="border-r border-border bg-muted/40 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Field
        </div>
        {candidates.map((c) => (
          <div key={c.id} className="border-r border-border last:border-0 px-4 py-4">
            <div className="flex items-start gap-3">
              <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white", generateAvatarColor(c.id))}>
                {getInitials(c.fullName)}
              </div>
              <div className="flex-1 min-w-0">
                <Link href={`/candidates/${c.id}`} className="flex items-center gap-1 text-sm font-semibold text-foreground hover:text-brand-700 group">
                  {c.fullName}
                  <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
                <p className="text-xs text-muted-foreground">{c.email}</p>
                {c.phone && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" />{c.phone}
                  </p>
                )}
              </div>
            </div>

            {/* Ranking */}
            <div className="mt-3 flex flex-wrap gap-1">
              {RANKINGS.map((r) => {
                const Icon = r.icon;
                const isSet = rankings[c.id] === r.value;
                return (
                  <button
                    key={r.value}
                    onClick={() => saveRanking(c.id, r.value)}
                    disabled={saving[c.id]}
                    title={r.label}
                    className={cn(
                      "flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold transition-all",
                      isSet ? r.color : "border-border text-muted-foreground hover:border-border"
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Field rows */}
      {FIELDS.map((field) => {
        const isDiff = diffFields.has(field.key);
        const vals   = candidates.map((c) => {
          const v = field.get(c);
          return field.format ? field.format(v) : ((v as string) ?? "");
        });

        // Skip if all are empty
        if (vals.every((v) => !v)) return null;

        return (
          <div
            key={field.key}
            className={cn(
              "grid border-b border-border last:border-0",
              gridCols,
              isDiff && "bg-amber-50/40"
            )}
          >
            <div className="border-r border-border bg-muted/30 px-4 py-3 text-xs font-medium text-muted-foreground flex items-start gap-1.5">
              {isDiff && <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" title="Values differ" />}
              {field.label}
            </div>
            {candidates.map((c, ci) => {
              const v   = field.get(c);
              const str = field.format ? field.format(v) : ((v as string) ?? "");
              // Highlight the "best" value in diff rows — the one that is non-empty and longest (heuristic)
              const isBest = isDiff && str && str.length === Math.max(...vals.map((x) => x?.length ?? 0));

              return (
                <div
                  key={c.id}
                  className={cn(
                    "border-r border-border last:border-0 px-4 py-3 text-sm",
                    isBest && "font-medium text-foreground",
                    !str && "text-muted-foreground/50"
                  )}
                >
                  {field.key === "linkedinUrl" && str ? (
                    <a href={str} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-brand-600 hover:underline text-xs">
                      <Linkedin className="h-3.5 w-3.5" />Profile
                    </a>
                  ) : str ? (
                    <span className={cn(
                      field.key === "summary" && "line-clamp-3 text-xs leading-relaxed",
                    )}>
                      {str}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground/40 italic">—</span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

function CompareContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const idsParam     = searchParams.get("ids") ?? "";
  const ids          = idsParam.split(",").filter(Boolean).slice(0, 4); // max 4

  const { candidates, loading } = useCandidates();

  const selected = useMemo(
    () => candidates.filter((c) => ids.includes(c.id)),
    [candidates, ids]
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (ids.length < 2) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-4">Select 2–4 candidates from the list to compare them.</p>
          <Link href="/candidates" className="text-sm text-brand-600 hover:underline">Back to candidates</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/candidates"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />Candidates
            </Link>
            <h1 className="text-xl font-bold text-foreground">
              Comparing {selected.length} candidates
            </h1>
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              Highlighted rows have differing values
            </span>
          </p>
        </div>

        {selected.length < ids.length && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-700">
            {ids.length - selected.length} candidate(s) could not be found — they may have been deleted.
          </div>
        )}

        {selected.length >= 2 && <CompareTable candidates={selected} />}
      </div>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    }>
      <CompareContent />
    </Suspense>
  );
}
