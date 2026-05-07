"use client";

import { useState, useRef } from "react";
import {
  FileText, Download, Printer, Upload, X, CheckCircle2,
  MapPin, Mail, Phone, Linkedin, Building2, GraduationCap,
  Zap, LayoutTemplate, List, Sparkles, Loader2,
} from "lucide-react";
import type { ParsedResume } from "@/app/api/candidates/[id]/parse-resume/route";
import { cn } from "@/lib/utils";
import type { Candidate, CandidateSkill } from "@/types";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorkEntry {
  id: string;
  company: string;
  title: string;
  start: string;
  end?: string;
  location?: string;
  bullets: string[];
}

export interface EducationEntry {
  id: string;
  school: string;
  degree: string;
  field: string;
  year: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPeriod(start: string, end?: string) {
  const fmt = (s: string) => {
    const [y, m] = s.split("-");
    return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m)-1]} ${y}`;
  };
  const startDate = new Date(start + "-01");
  const endDate   = end ? new Date(end + "-01") : new Date();
  const months    = (endDate.getFullYear() - startDate.getFullYear()) * 12
                    + (endDate.getMonth() - startDate.getMonth());
  const yrs = Math.floor(months / 12);
  const mos = months % 12;
  const dur = [yrs > 0 ? `${yrs}y` : "", mos > 0 ? `${mos}m` : ""].filter(Boolean).join(" ");
  return `${fmt(start)} – ${end ? fmt(end) : "Present"}${dur ? ` · ${dur}` : ""}`;
}

const SKILL_PROFICIENCY: Record<string, string> = {
  expert:       "bg-brand-600 text-white",
  advanced:     "bg-brand-100 text-brand-700",
  intermediate: "bg-slate-100 text-slate-700",
  beginner:     "bg-slate-50 text-slate-500",
};

// ─── Upload Zone ──────────────────────────────────────────────────────────────

function UploadZone({
  fileName,
  onUpload,
  onRemove,
}: {
  fileName?: string;
  onUpload: (name: string, file: File) => void;
  onRemove: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onUpload(file.name, file);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onUpload(file.name, file);
  }

  if (fileName) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <FileText className="h-5 w-5 text-emerald-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{fileName}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Uploaded · PDF</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => inputRef.current?.click()}
            className="text-xs font-medium text-brand-600 hover:underline"
          >
            Replace
          </button>
          <button
            onClick={onRemove}
            className="rounded-md p-1 text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <input ref={inputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleChange} />
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-8 cursor-pointer transition-all",
        dragging
          ? "border-brand-400 bg-brand-50/60"
          : "border-border bg-muted/20 hover:border-brand-300 hover:bg-brand-50/30"
      )}
    >
      <Upload className={cn("h-7 w-7 transition-colors", dragging ? "text-brand-500" : "text-muted-foreground/50")} />
      <div className="text-center">
        <p className="text-xs font-medium text-foreground">Drop a resume here, or click to upload</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">PDF, DOC, DOCX · up to 10MB</p>
      </div>
      <input ref={inputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleChange} />
    </div>
  );
}

// ─── Rendered Resume Document ─────────────────────────────────────────────────

function ResumeDocument({
  candidate,
  work,
  education,
}: {
  candidate: Candidate;
  work: WorkEntry[];
  education: EducationEntry[];
}) {
  const loc         = candidate.location;
  const locationStr = [loc?.city, loc?.state, loc?.country].filter(Boolean).join(", ");
  const skills      = candidate.skills ?? [];

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
      {/* Resume paper */}
      <div className="px-10 py-8 font-serif text-foreground max-w-none" style={{ fontFamily: "Georgia, serif" }}>

        {/* Header */}
        <div className="border-b-2 border-gray-900 pb-4 mb-5">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{candidate.fullName}</h1>
          {candidate.currentTitle && (
            <p className="text-sm font-medium text-muted-foreground mt-0.5 not-italic" style={{ fontFamily: "system-ui, sans-serif" }}>
              {candidate.currentTitle}
              {candidate.currentCompany ? ` · ${candidate.currentCompany}` : ""}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" style={{ fontFamily: "system-ui, sans-serif" }}>
            {candidate.email && (
              <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{candidate.email}</span>
            )}
            {candidate.phone && (
              <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{candidate.phone}</span>
            )}
            {locationStr && (
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{locationStr}</span>
            )}
            {candidate.linkedinUrl && (
              <a
                href={candidate.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-brand-600 transition-colors"
              >
                <Linkedin className="h-3 w-3" />LinkedIn
              </a>
            )}
          </div>
        </div>

        {/* Summary */}
        {candidate.summary && (
          <section className="mb-5">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2" style={{ fontFamily: "system-ui, sans-serif" }}>
              Summary
            </h2>
            <p className="text-sm leading-relaxed text-foreground">{candidate.summary}</p>
          </section>
        )}

        {/* Skills */}
        {skills.length > 0 && (
          <section className="mb-5">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2" style={{ fontFamily: "system-ui, sans-serif" }}>
              Skills
            </h2>
            <div className="flex flex-wrap gap-1.5" style={{ fontFamily: "system-ui, sans-serif" }}>
              {skills.map((cs) => (
                <span
                  key={cs.skillId}
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                    SKILL_PROFICIENCY[cs.proficiencyLevel ?? "intermediate"]
                  )}
                >
                  {cs.skill.name}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Experience */}
        {work.length > 0 && (
          <section className="mb-5">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3" style={{ fontFamily: "system-ui, sans-serif" }}>
              Experience
            </h2>
            <div className="space-y-4">
              {work.map((entry) => (
                <div key={entry.id}>
                  <div className="flex items-baseline justify-between gap-2" style={{ fontFamily: "system-ui, sans-serif" }}>
                    <div>
                      <span className="text-sm font-bold text-foreground">{entry.title}</span>
                      <span className="text-sm text-muted-foreground"> · {entry.company}</span>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-muted-foreground whitespace-nowrap">{formatPeriod(entry.start, entry.end)}</p>
                      {entry.location && (
                        <p className="text-[10px] text-muted-foreground/60">{entry.location}</p>
                      )}
                    </div>
                  </div>
                  {entry.bullets.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 text-sm text-foreground">
                      {entry.bullets.map((b, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-400" />
                          <span className="leading-relaxed">{b}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Education */}
        {education.length > 0 && (
          <section>
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3" style={{ fontFamily: "system-ui, sans-serif" }}>
              Education
            </h2>
            <div className="space-y-2">
              {education.map((entry) => (
                <div key={entry.id} className="flex items-baseline justify-between" style={{ fontFamily: "system-ui, sans-serif" }}>
                  <div>
                    <span className="text-sm font-bold text-foreground">{entry.school}</span>
                    <span className="text-sm text-muted-foreground"> · {entry.degree} {entry.field}</span>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{entry.year}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ─── Parsed Data View ─────────────────────────────────────────────────────────

function ParsedView({
  candidate,
  work,
  education,
}: {
  candidate: Candidate;
  work: WorkEntry[];
  education: EducationEntry[];
}) {
  const skills = candidate.skills ?? [];
  const byLevel: Record<string, CandidateSkill[]> = {};
  skills.forEach((s) => {
    const lvl = s.proficiencyLevel ?? "intermediate";
    if (!byLevel[lvl]) byLevel[lvl] = [];
    byLevel[lvl].push(s);
  });

  return (
    <div className="space-y-4">
      {/* Work */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 bg-muted/30">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-xs font-semibold text-foreground">Work Experience</p>
          <span className="ml-auto text-[10px] text-muted-foreground">{work.length} roles</span>
        </div>
        <div className="divide-y divide-border">
          {work.map((entry) => (
            <div key={entry.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-foreground">{entry.title}</p>
                  <p className="text-xs text-muted-foreground">{entry.company}{entry.location ? ` · ${entry.location}` : ""}</p>
                </div>
                <p className="shrink-0 text-[10px] text-muted-foreground">{formatPeriod(entry.start, entry.end)}</p>
              </div>
              {entry.bullets.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {entry.bullets.map((b, i) => (
                    <li key={i} className="flex gap-1.5 text-xs text-muted-foreground">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Education */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 bg-muted/30">
          <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-xs font-semibold text-foreground">Education</p>
        </div>
        <div className="divide-y divide-border">
          {education.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-xs font-semibold text-foreground">{entry.school}</p>
                <p className="text-xs text-muted-foreground">{entry.degree} · {entry.field}</p>
              </div>
              <span className="text-[10px] text-muted-foreground">{entry.year}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Skills by level */}
      {skills.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 bg-muted/30">
            <Zap className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-semibold text-foreground">Skills</p>
            <span className="ml-auto text-[10px] text-muted-foreground">{skills.length} total</span>
          </div>
          <div className="p-4 space-y-3">
            {(["expert", "advanced", "intermediate", "beginner"] as const).map((level) => {
              const group = byLevel[level];
              if (!group?.length) return null;
              return (
                <div key={level}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.map((cs) => (
                      <span
                        key={cs.skillId}
                        className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium", SKILL_PROFICIENCY[level])}
                      >
                        {cs.skill.name}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export interface ResumeViewerProps {
  candidate: Candidate;
  work: WorkEntry[];
  education: EducationEntry[];
  onParsed?: (parsed: ParsedResume) => void;
}

export function ResumeViewer({ candidate, work, education, onParsed }: ResumeViewerProps) {
  const [view, setView]                 = useState<"document" | "parsed">("document");
  const [fileName, setFileName]         = useState<string | undefined>(undefined);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsing, setParsing]           = useState(false);
  const [parseResult, setParseResult]   = useState<ParsedResume | null>(null);

  function handleUpload(name: string, file?: File) {
    setFileName(name);
    if (file) setUploadedFile(file);
    setParseResult(null);
    toast.success("Resume uploaded — click \"Parse with AI\" to extract data");
  }

  function handleRemove() {
    setFileName(undefined);
    setUploadedFile(null);
    setParseResult(null);
    toast.success("Resume removed");
  }

  function handleDownload() {
    if (!fileName) { toast.error("No resume on file"); return; }
    toast.success(`Downloading ${fileName}`);
  }

  function handlePrint() {
    window.print();
  }

  async function handleParseResume() {
    if (!uploadedFile) { toast.error("Upload a resume first"); return; }
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", uploadedFile);
      const res = await fetch(`/api/candidates/${candidate.id}/parse-resume`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(error ?? `HTTP ${res.status}`);
      }
      const { parsed, updated } = await res.json();
      setParseResult(parsed as ParsedResume);
      if (updated) {
        toast.success("Profile updated from resume — reload to see changes");
        onParsed?.(parsed as ParsedResume);
      } else {
        toast.success("Resume parsed — no new fields to update");
      }
    } catch (err) {
      toast.error(`Parse failed: ${String(err)}`);
    } finally {
      setParsing(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        {/* View toggle */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => setView("document")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
              view === "document" ? "bg-brand-600 text-white" : "text-muted-foreground hover:bg-accent"
            )}
          >
            <LayoutTemplate className="h-3.5 w-3.5" />
            Document
          </button>
          <button
            onClick={() => setView("parsed")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-l border-border transition-colors",
              view === "parsed" ? "bg-brand-600 text-white" : "text-muted-foreground hover:bg-accent"
            )}
          >
            <List className="h-3.5 w-3.5" />
            Parsed data
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          {/* AI Parse button — shown when a file is uploaded */}
          {uploadedFile && (
            <button
              onClick={handleParseResume}
              disabled={parsing}
              className="flex items-center gap-1.5 rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {parsing
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Sparkles className="h-3.5 w-3.5" />
              }
              {parsing ? "Parsing…" : "Parse with AI"}
            </button>
          )}
          <button
            onClick={handleDownload}
            disabled={!fileName}
            className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </button>
        </div>
      </div>

      {/* Upload zone */}
      <UploadZone
        fileName={fileName}
        onUpload={handleUpload}
        onRemove={handleRemove}
      />

      {/* AI Parse result */}
      {parseResult && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 dark:bg-brand-950/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-500" />
              <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">AI extracted fields</p>
              <span className="text-[10px] text-brand-500">· applied to profile</span>
            </div>
            <button onClick={() => setParseResult(null)} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {([
              ["Title",   parseResult.currentTitle],
              ["Company", parseResult.currentCompany],
              ["Location", parseResult.location],
              ["Email",   parseResult.email],
              ["Phone",   parseResult.phone],
              ["Experience", parseResult.yearsExperience != null ? `${parseResult.yearsExperience} yrs` : null],
            ] as [string, string | number | null | undefined][]).filter(([, v]) => v != null).map(([label, value]) => (
              <div key={label} className="rounded-lg bg-white dark:bg-brand-950/40 border border-brand-100 px-3 py-2">
                <p className="text-[10px] font-semibold text-muted-foreground">{label}</p>
                <p className="text-xs text-foreground mt-0.5 truncate">{String(value)}</p>
              </div>
            ))}
          </div>
          {parseResult.skills && parseResult.skills.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">Skills extracted</p>
              <div className="flex flex-wrap gap-1.5">
                {parseResult.skills.map((s) => (
                  <span key={s} className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-medium text-brand-700">{s}</span>
                ))}
              </div>
            </div>
          )}
          {parseResult.summary && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground mb-1">Summary</p>
              <p className="text-xs text-foreground leading-relaxed">{parseResult.summary}</p>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      {view === "document" ? (
        <ResumeDocument candidate={candidate} work={work} education={education} />
      ) : (
        <ParsedView candidate={candidate} work={work} education={education} />
      )}
    </div>
  );
}
