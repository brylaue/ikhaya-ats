"use client";
/**
 * RediscoveryPanel — US-117: Rediscovery Recommendations
 * Silver medalists from similar closed reqs who now fit the current opening.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { RefreshCw, MapPin, Briefcase, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface SilverMedalist {
  candidateId:  string;
  firstName:    string;
  lastName:     string;
  headline:     string | null;
  location:     string | null;
  priorJobTitle: string;
  priorJobDate:  string;
  stageReached:  string | null;
}

interface Props { jobId: string; agencyId: string }

export function RediscoveryPanel({ jobId, agencyId }: Props) {
  const supabase = createClient();
  const [candidates, setCandidates] = useState<SilverMedalist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // Find candidates who were previously in pipeline for similar title jobs
      // but were not placed — silver medalists
      const { data: currentJob } = await supabase
        .from("jobs").select("title").eq("id", jobId).single();

      if (!currentJob) { setLoading(false); return; }

      // Find similar jobs (title keyword match) that are closed
      const titleWords = currentJob.title.split(/\s+/).filter(w => w.length > 3);
      const titleFilter = titleWords.slice(0, 2).map(w => `title.ilike.%${w}%`).join(",");

      const { data: similarJobs } = await supabase
        .from("jobs")
        .select("id")
        .eq("agency_id", agencyId)
        .in("status", ["closed", "filled"])
        .neq("id", jobId)
        .or(titleFilter)
        .limit(10);

      if (!similarJobs?.length) { setLoading(false); return; }

      const jobIds = similarJobs.map(j => j.id);

      // Get candidates from those jobs who weren't placed
      const { data: apps } = await supabase
        .from("applications")
        .select(`
          candidate_id, stage_id, updated_at,
          jobs(title, closed_at),
          candidates(id, first_name, last_name, headline, location)
        `)
        .in("job_id", jobIds)
        .not("candidates.id", "is", null)
        .order("updated_at", { ascending: false })
        .limit(20);

      // Dedupe by candidate_id and exclude placed candidates
      const { data: placements } = await supabase
        .from("placements").select("candidate_id").eq("agency_id", agencyId);
      const placedIds = new Set((placements ?? []).map((p: any) => p.candidate_id));

      const seen = new Set<string>();
      const result: SilverMedalist[] = [];
      for (const app of apps ?? []) {
        const cand = (app as any).candidates;
        const job  = (app as any).jobs;
        if (!cand || placedIds.has(cand.id) || seen.has(cand.id)) continue;
        seen.add(cand.id);
        result.push({
          candidateId:   cand.id,
          firstName:     cand.first_name,
          lastName:      cand.last_name,
          headline:      cand.headline,
          location:      cand.location,
          priorJobTitle: job?.title ?? "Unknown role",
          priorJobDate:  app.updated_at,
          stageReached:  null,
        });
      }

      setCandidates(result.slice(0, 10));
      setLoading(false);
    }
    load();
  }, [jobId, agencyId]);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
        <RefreshCw className="h-4 w-4 text-brand-600" />
        <h3 className="text-sm font-semibold text-foreground flex-1">Silver Medalists</h3>
        <span className="text-[10px] bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-medium">
          {candidates.length} found
        </span>
      </div>

      {loading ? (
        <div className="divide-y divide-border">
          {[...Array(4)].map((_, i) => <div key={i} className="h-14 animate-pulse bg-muted/20 m-3 rounded-lg" />)}
        </div>
      ) : candidates.length === 0 ? (
        <div className="py-10 text-center px-5">
          <RefreshCw className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">
            No silver medalists found from similar requisitions.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {candidates.map(c => (
            <div key={c.candidateId} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors">
              <div className="flex-1 min-w-0">
                <Link href={`/candidates/${c.candidateId}`}
                  className="text-sm font-medium text-foreground hover:text-brand-600">
                  {c.firstName} {c.lastName}
                </Link>
                <div className="flex items-center gap-2 mt-0.5">
                  {c.headline && (
                    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground truncate">
                      <Briefcase className="h-2.5 w-2.5 shrink-0" />{c.headline}
                    </span>
                  )}
                  {c.location && (
                    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground shrink-0">
                      <MapPin className="h-2.5 w-2.5" />{c.location}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] text-muted-foreground">{c.priorJobTitle}</p>
                <div className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                  <Clock className="h-2 w-2" />
                  {new Date(c.priorJobDate).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
