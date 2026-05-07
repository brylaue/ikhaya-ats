"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { MapPin, Star, Zap } from "lucide-react";
import { usePortalData } from "@/lib/supabase/hooks";
import { cn, getInitials, generateAvatarColor } from "@/lib/utils";
import { toast } from "sonner";
import type { ClientDecision } from "@/types";
import Link from "next/link";

export default function ComparePage() {
  const params = useParams<{ portalSlug: string }>();
  const { data, loading, notFound } = usePortalData(params.portalSlug);
  const [decisions, setDecisions] = useState<Record<string, ClientDecision>>({});

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Client not found</p>
      </div>
    );
  }

  const client = data.company;
  const clientJobs = data.jobs.filter((j) => j.status === "active");
  // First 3 submissions across all jobs for this client
  const compareApps = data.submissions.filter((s) => s.candidate).slice(0, 3);
  const firstJob = clientJobs[0];

  const handleDecision = (appId: string, decision: ClientDecision) => {
    setDecisions((prev) => ({ ...prev, [appId]: decision }));
    toast.success(`Candidate ${decision === "advance" ? "advanced" : decision === "hold" ? "held" : "passed"}`);
  };

  const decisionColors: Record<ClientDecision, string> = {
    advance: "bg-green-100 border-green-300 text-green-700 hover:bg-green-200",
    hold: "bg-amber-100 border-amber-300 text-amber-700 hover:bg-amber-200",
    pass: "bg-red-100 border-red-300 text-red-700 hover:bg-red-200",
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white">
      {/* Portal Header */}
      <div className="border-b border-sky-200 bg-white px-6 py-4 flex items-center justify-between">
        <div className="text-sm font-medium text-sky-600">Candidate Comparison</div>
        <div className="text-lg font-semibold text-foreground">{client.name ?? ""}</div>
        <Link href={`/portal/${params.portalSlug}`} className="text-sm text-sky-600 hover:text-sky-700 font-medium">
          Back to Candidates
        </Link>
      </div>

      {/* Content */}
      <div className="p-8">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Compare Candidates</h1>
          {firstJob && <p className="text-sm text-muted-foreground mt-1">{firstJob.title}</p>}
        </div>

        {compareApps.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No candidates to compare yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-6 mb-8">
            {compareApps.map((app, idx) => {
              const candidate = app.candidate!;
              const decision = decisions[app.id];
              const score = 0; // score not available in portal data yet

              return (
                <div key={app.id} className="bg-white rounded-lg border border-sky-200 shadow-sm overflow-hidden flex flex-col">
                  {/* Rank Badge */}
                  <div className="relative h-12 bg-gradient-to-r from-sky-500 to-sky-600 flex items-center justify-center">
                    <span className="text-2xl font-bold text-white cursor-grab active:cursor-grabbing">{`#${idx + 1}`}</span>
                  </div>

                  {/* Avatar & Info */}
                  <div className="p-6 text-center flex-1">
                    <div className={cn("flex h-16 w-16 items-center justify-center rounded-full mx-auto mb-3 text-lg font-semibold text-white", generateAvatarColor(candidate.id))}>
                      {getInitials(candidate.fullName)}
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">{candidate.fullName}</h3>
                    <p className="text-sm text-muted-foreground">{candidate.currentTitle}</p>
                    <p className="text-xs text-muted-foreground">{candidate.currentCompany}</p>

                    {/* Recruiter Headline */}
                    <p className="text-xs italic text-muted-foreground mt-2 line-clamp-2">{app.recruiterNote || "No notes provided"}</p>
                  </div>

                  {/* Comparison Rows */}
                  <div className="border-t border-sky-100 px-6 py-4 space-y-3">
                    {/* Years Exp */}
                    <div className="flex justify-between items-center">
                      {idx === 0 && <span className="text-xs font-medium text-muted-foreground w-24">Years Exp</span>}
                      <span className={cn("text-sm font-semibold px-2 py-1 rounded", idx === 0 ? "text-foreground" : "text-foreground")}>
                        {candidate.skills?.[0]?.yearsExperience || "—"} yrs
                      </span>
                    </div>

                    {/* Current Title */}
                    <div className="flex justify-between items-center">
                      {idx === 0 && <span className="text-xs font-medium text-muted-foreground w-24">Title</span>}
                      <span className="text-sm text-foreground">{candidate.currentTitle}</span>
                    </div>

                    {/* Location */}
                    <div className="flex justify-between items-center">
                      {idx === 0 && <span className="text-xs font-medium text-muted-foreground w-24">Location</span>}
                      <div className="flex items-center gap-1 text-sm text-foreground">
                        <MapPin size={14} className="text-sky-500" />
                        {candidate.location?.city}, {candidate.location?.state}
                      </div>
                    </div>

                    {/* Salary Target */}
                    <div className="flex justify-between items-center">
                      {idx === 0 && <span className="text-xs font-medium text-muted-foreground w-24">Salary</span>}
                      <span className={cn("text-sm font-semibold px-2 py-1 rounded", candidate.desiredSalary === Math.min(...compareApps.map((a) => a.candidate?.desiredSalary || 0)) && "bg-green-100 text-green-700")}>
                        ${candidate.desiredSalary?.toLocaleString() || "—"}
                      </span>
                    </div>

                    {/* Skills */}
                    <div>
                      {idx === 0 && <span className="text-xs font-medium text-muted-foreground block mb-2">Skills</span>}
                      <div className="flex flex-wrap gap-1">
                        {candidate.skills?.slice(0, 3).map((skill, i) => (
                          <span key={i} className="text-xs bg-sky-100 text-sky-700 px-2 py-1 rounded-full">
                            {skill.skill.name}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Score */}
                    <div className="flex justify-between items-center pt-2 border-t border-sky-100">
                      {idx === 0 && <span className="text-xs font-medium text-muted-foreground w-24">Score</span>}
                      <div className="flex gap-0.5">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            size={14}
                            className={cn("transition-colors", i < Math.floor(score / 20) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40")}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Decision Buttons */}
                  <div className="border-t border-sky-100 p-4 flex gap-2">
                    {(["advance", "hold", "pass"] as const).map((d) => (
                      <button
                        key={d}
                        onClick={() => handleDecision(app.id, d)}
                        className={cn(
                          "flex-1 py-2 rounded-md text-xs font-medium transition-colors border",
                          decision === d
                            ? decisionColors[d]
                            : "bg-muted/50 border-border text-foreground hover:bg-muted"
                        )}
                      >
                        {decision === d && <Zap size={12} className="inline mr-1" />}
                        {d === "advance" ? "Advance" : d === "hold" ? "Hold" : "Pass"}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-12">
          <Link href={`/portal/${params.portalSlug}`} className="text-sm text-sky-600 hover:text-sky-700 font-medium">
            ← Back to All Candidates
          </Link>
          <button
            onClick={() => {
              const ranked = Object.entries(decisions);
              if (ranked.length === 0) {
                toast.error("Make at least one decision before submitting");
                return;
              }
              const advances = ranked.filter(([, d]) => d === "advance").length;
              const passes   = ranked.filter(([, d]) => d === "pass").length;
              toast.success(`Rankings submitted — ${advances} advancing, ${passes} passing`, {
                description: "The recruiting team has been notified.",
              });
            }}
            className="px-6 py-2 bg-sky-500 text-white rounded-lg font-medium hover:bg-sky-600 transition-colors"
          >
            Submit Rankings
          </button>
        </div>
      </div>
    </div>
  );
}
