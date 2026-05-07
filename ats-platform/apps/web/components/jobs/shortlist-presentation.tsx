"use client";
/**
 * ShortlistPresentationMode — US-123: Shortlist Presentation Mode
 * Full-screen candidate-by-candidate presentation for client meetings.
 */

import { useState, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Eye, EyeOff, MapPin, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LonglistEntry } from "@/lib/supabase/hooks";

interface Props {
  candidates: LonglistEntry[];
  jobTitle:   string;
  onClose:    () => void;
}

export function ShortlistPresentationMode({ candidates, jobTitle, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [hidePii, setHidePii] = useState(false);

  const current = candidates[index];
  const total   = candidates.length;

  const prev = useCallback(() => setIndex(i => Math.max(0, i - 1)), []);
  const next = useCallback(() => setIndex(i => Math.min(total - 1, i + 1)), [total]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") next();
      if (e.key === "ArrowLeft")                   prev();
      if (e.key === "Escape")                      onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [next, prev, onClose]);

  if (!current) return null;

  const cand = current.candidate;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-4 text-white/60">
        <div>
          <p className="text-xs font-medium text-white/40 uppercase tracking-wider">{jobTitle}</p>
          <p className="text-lg font-semibold text-white">Shortlist</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setHidePii(v => !v)}
            className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors"
          >
            {hidePii ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            {hidePii ? "Show details" : "Hide PII"}
          </button>
          <button type="button" onClick={onClose} className="text-white/60 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Main card */}
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="w-full max-w-2xl bg-white/5 rounded-3xl p-12 backdrop-blur-sm border border-white/10 text-center space-y-6">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-full bg-brand-600 mx-auto flex items-center justify-center text-3xl font-bold text-white">
            {cand ? `${cand.firstName[0]}${cand.lastName[0]}` : "?"}
          </div>

          {/* Name */}
          <div>
            <h1 className="text-4xl font-bold text-white">
              {hidePii ? "Candidate " + (index + 1) : cand ? `${cand.firstName} ${cand.lastName}` : "Unknown"}
            </h1>
            {!hidePii && cand?.headline && (
              <div className="flex items-center justify-center gap-1.5 mt-2 text-white/70">
                <Briefcase className="h-4 w-4" />
                <p className="text-lg">{cand.headline}</p>
              </div>
            )}
            {!hidePii && cand?.location && (
              <div className="flex items-center justify-center gap-1 mt-1 text-white/50">
                <MapPin className="h-3.5 w-3.5" />
                <p className="text-sm">{cand.location}</p>
              </div>
            )}
          </div>

          {/* Notes */}
          {current.notes && (
            <div className="bg-white/10 rounded-xl px-6 py-4 text-left">
              <p className="text-xs text-white/50 font-medium uppercase tracking-wider mb-1">Recruiter notes</p>
              <p className="text-white/80 text-sm">{current.notes}</p>
            </div>
          )}

          {/* Rank */}
          {current.rank && (
            <p className="text-white/30 text-sm">Rank #{current.rank}</p>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-center gap-8 px-8 py-6">
        <button type="button" onClick={prev} disabled={index === 0}
          className="flex items-center gap-2 px-6 py-3 rounded-xl border border-white/20 text-white/60 hover:text-white hover:border-white/40 disabled:opacity-30 transition-colors">
          <ChevronLeft className="h-5 w-5" />
          Previous
        </button>

        {/* Progress dots */}
        <div className="flex gap-1.5">
          {candidates.map((_, i) => (
            <button key={i} type="button" onClick={() => setIndex(i)}
              className={cn("w-2 h-2 rounded-full transition-colors",
                i === index ? "bg-white" : "bg-white/20 hover:bg-white/40")} />
          ))}
        </div>

        <button type="button" onClick={next} disabled={index === total - 1}
          className="flex items-center gap-2 px-6 py-3 rounded-xl border border-white/20 text-white/60 hover:text-white hover:border-white/40 disabled:opacity-30 transition-colors">
          Next
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <p className="text-center text-white/30 text-xs pb-4">
        {index + 1} of {total} · ← → to navigate · Esc to exit
      </p>
    </div>
  );
}
