"use client";

/**
 * FindSimilarPanel — US-495: Find More Like This
 *
 * Side panel that shows the top-20 candidates most similar to the source
 * candidate by pgvector cosine similarity.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { X, Search, MapPin, Briefcase, Sparkles, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SimilarCandidate {
  id:         string;
  firstName:  string;
  lastName:   string;
  headline:   string | null;
  location:   string | null;
  status:     string;
  similarity: number;
}

interface Props {
  candidateId:   string;
  candidateName: string;
  onClose:       () => void;
}

export function FindSimilarPanel({ candidateId, candidateName, onClose }: Props) {
  const [results, setResults] = useState<SimilarCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableOnly, setAvailableOnly] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/ai/find-similar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidateId, filters: { availableOnly } }),
        });
        const data = await res.json();
        if (data.error === "no_embedding") {
          setError("no_embedding");
        } else if (!res.ok) {
          setError(data.error ?? "Failed to load");
        } else {
          setResults(data.candidates ?? []);
        }
      } catch {
        setError("Failed to load similar candidates");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [candidateId, availableOnly]);

  const similarityColor = (score: number) =>
    score >= 0.85 ? "text-emerald-600 bg-emerald-50" :
    score >= 0.75 ? "text-blue-600 bg-blue-50" :
    "text-slate-600 bg-slate-100";

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-96 bg-card border-l border-border shadow-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-600" />
          <div>
            <p className="text-sm font-semibold text-foreground">Find Similar</p>
            <p className="text-[10px] text-muted-foreground">to {candidateName}</p>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Filter bar */}
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-3 shrink-0">
        <label className="flex items-center gap-1.5 cursor-pointer text-xs text-foreground">
          <input type="checkbox" checked={availableOnly}
            onChange={e => setAvailableOnly(e.target.checked)}
            className="accent-brand-600" />
          Available only
        </label>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="divide-y divide-border">
            {[...Array(8)].map((_, i) => <div key={i} className="h-16 animate-pulse bg-muted/20 m-4 rounded-lg" />)}
          </div>
        ) : error === "no_embedding" ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <AlertCircle className="h-8 w-8 text-amber-500 mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">Profile incomplete</p>
            <p className="text-xs text-muted-foreground">
              This candidate's embedding hasn't been generated yet. Import a resume or run the embedding job to enable similarity search.
            </p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <Search className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">No similar candidates found</p>
            <p className="text-xs text-muted-foreground">Try removing filters or building out your talent pool.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {results.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                <span className="text-[10px] text-muted-foreground w-4 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <Link href={`/candidates/${c.id}`}
                    className="text-sm font-medium text-foreground hover:text-brand-600 block truncate">
                    {c.firstName} {c.lastName}
                  </Link>
                  {c.headline && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Briefcase className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                      <p className="text-[10px] text-muted-foreground truncate">{c.headline}</p>
                    </div>
                  )}
                  {c.location && (
                    <div className="flex items-center gap-1">
                      <MapPin className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                      <p className="text-[10px] text-muted-foreground truncate">{c.location}</p>
                    </div>
                  )}
                </div>
                <div className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0", similarityColor(c.similarity))}>
                  {Math.round(c.similarity * 100)}%
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-border shrink-0">
        <p className="text-[10px] text-muted-foreground text-center">
          Ranked by vector similarity · {results.length} candidates shown
        </p>
      </div>
    </div>
  );
}
