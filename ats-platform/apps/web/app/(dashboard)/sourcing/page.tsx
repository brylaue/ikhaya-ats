"use client";

import { useState, useMemo } from "react";
import {
  Search, Filter, Sliders, BookmarkPlus, UserPlus,
  ChevronDown, ChevronRight, X, Check, MapPin,
  Briefcase, GraduationCap, DollarSign, Building2,
  Clock, Star, StarOff, ExternalLink, Mail, Phone,
  Linkedin, Globe, Tag, MoreHorizontal, Zap, Users,
  SlidersHorizontal, BookOpen, History, Download,
  Plus, Trash2, Eye, SendHorizonal, LayoutGrid, List,
  Sparkles,
} from "lucide-react";
import { NLTalentQuery } from "@/components/candidates/nl-talent-query";
import type { TalentQueryResult } from "@/app/api/ai/talent-query/route";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useCandidates, useSavedSearches } from "@/lib/supabase/hooks";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SourcingCandidate {
  id: string;
  name: string;
  title: string;
  company: string;
  location: string;
  experience: number; // years
  skills: string[];
  education?: string;
  salary?: { min: number; max: number; currency: string };
  availability: "immediately" | "30days" | "60days" | "passive";
  profileUrl?: string;
  linkedinUrl?: string;
  email?: string;
  phone?: string;
  summary: string;
  starred: boolean;
  inPipeline: boolean;
  tags: string[];
  source: "linkedin" | "github" | "referral" | "database" | "website";
  matchScore: number; // 0–100
}

interface SavedSearch {
  id: string;
  name: string;
  query: string;
  filters: Partial<SearchFilters>;
  resultCount: number;
  savedAt: string;
}

interface SearchFilters {
  titles: string[];
  skills: string[];
  locations: string[];
  experienceMin: number;
  experienceMax: number;
  salaryMin: number;
  salaryMax: number;
  availability: string[];
  companies: string[];
  education: string[];
}

const SKILL_SUGGESTIONS = [
  "Go", "Python", "TypeScript", "React", "Kubernetes", "AWS", "Machine Learning",
  "Distributed Systems", "PostgreSQL", "Product Strategy", "B2B SaaS", "Team Leadership",
  "PyTorch", "Apache Spark", "Figma", "Design Systems",
];

const LOCATION_SUGGESTIONS = [
  "San Francisco, CA", "New York, NY", "Austin, TX", "Seattle, WA", "Remote",
  "Mountain View, CA", "Boston, MA", "Chicago, IL", "Los Angeles, CA",
];

const AVAILABILITY_LABELS: Record<string, string> = {
  immediately: "Immediately",
  "30days": "Within 30 days",
  "60days": "Within 60 days",
  passive: "Passively looking",
};

const AVAILABILITY_DOT: Record<string, string> = {
  immediately: "bg-emerald-500",
  "30days":     "bg-brand-500",
  "60days":     "bg-amber-500",
  passive:      "bg-slate-400",
};

const SOURCE_LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  github:   "GitHub",
  referral: "Referral",
  database: "Database",
  website:  "Website",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSalary(n: number) {
  return `$${Math.round(n / 1000)}k`;
}

function matchScoreColor(score: number) {
  if (score >= 90) return "text-emerald-600 bg-emerald-50";
  if (score >= 75) return "text-brand-600 bg-brand-50";
  if (score >= 60) return "text-amber-600 bg-amber-50";
  return "text-slate-600 bg-slate-100";
}

// ─── Candidate Card (Grid) ────────────────────────────────────────────────────

function CandidateCard({
  candidate,
  isSelected,
  onSelect,
  onStar,
  onAddToPipeline,
  onOutreach,
}: {
  candidate: SourcingCandidate;
  isSelected: boolean;
  onSelect: () => void;
  onStar: () => void;
  onAddToPipeline: () => void;
  onOutreach: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        "group relative rounded-xl border bg-card p-4 cursor-pointer transition-all hover:shadow-sm",
        isSelected
          ? "border-brand-400 ring-2 ring-brand-100 dark:ring-brand-900"
          : "border-border hover:border-brand-200"
      )}
    >
      {/* Match score */}
      <div className={cn(
        "absolute top-3 right-3 rounded-full px-2 py-0.5 text-[10px] font-bold",
        matchScoreColor(candidate.matchScore)
      )}>
        {candidate.matchScore}% match
      </div>

      {/* Star */}
      <button
        onClick={(e) => { e.stopPropagation(); onStar(); }}
        className="absolute top-3 right-16 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {candidate.starred
          ? <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
          : <StarOff className="h-4 w-4 text-muted-foreground hover:text-amber-400" />
        }
      </button>

      {/* Avatar + name */}
      <div className="flex items-start gap-3 mb-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white">
          {candidate.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1 pr-16">
          <p className="text-sm font-semibold text-foreground leading-tight">{candidate.name}</p>
          <p className="text-xs text-muted-foreground truncate">{candidate.title}</p>
          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Building2 className="h-3 w-3 shrink-0" />{candidate.company}
          </div>
        </div>
      </div>

      {/* Meta */}
      <div className="space-y-1 mb-3">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />{candidate.location}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" />{candidate.experience}y experience
        </div>
        {candidate.salary && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <DollarSign className="h-3 w-3 shrink-0" />
            {formatSalary(candidate.salary.min)}–{formatSalary(candidate.salary.max)}
          </div>
        )}
      </div>

      {/* Skills */}
      <div className="flex flex-wrap gap-1 mb-3">
        {candidate.skills.slice(0, 4).map(skill => (
          <span key={skill} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">
            {skill}
          </span>
        ))}
        {candidate.skills.length > 4 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            +{candidate.skills.length - 4}
          </span>
        )}
      </div>

      {/* Availability */}
      <div className="flex items-center gap-1.5 mb-3">
        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", AVAILABILITY_DOT[candidate.availability])} />
        <span className="text-[11px] text-muted-foreground">{AVAILABILITY_LABELS[candidate.availability]}</span>
        {candidate.inPipeline && (
          <span className="ml-auto rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700">
            In pipeline
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 border-t border-border pt-3">
        <button
          onClick={(e) => { e.stopPropagation(); onAddToPipeline(); }}
          disabled={candidate.inPipeline}
          className={cn(
            "flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-semibold transition-colors",
            candidate.inPipeline
              ? "bg-teal-50 text-teal-600 cursor-not-allowed"
              : "bg-brand-600 text-white hover:bg-brand-700"
          )}
        >
          <UserPlus className="h-3 w-3" />
          {candidate.inPipeline ? "In Pipeline" : "Add to Pipeline"}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onOutreach(); }}
          className="flex items-center justify-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-accent transition-colors"
        >
          <Mail className="h-3 w-3" />
        </button>
        {candidate.linkedinUrl && (
          <button
            onClick={(e) => { e.stopPropagation(); if (candidate.linkedinUrl) window.open(candidate.linkedinUrl, "_blank"); }}
            className="flex items-center justify-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-accent transition-colors"
          >
            <Linkedin className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Candidate Row (List) ─────────────────────────────────────────────────────

function CandidateRow({
  candidate,
  isSelected,
  onSelect,
  onStar,
  onAddToPipeline,
  onOutreach,
}: {
  candidate: SourcingCandidate;
  isSelected: boolean;
  onSelect: () => void;
  onStar: () => void;
  onAddToPipeline: () => void;
  onOutreach: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        "group flex items-center gap-4 px-5 py-3.5 border-b border-border cursor-pointer transition-colors",
        isSelected ? "bg-brand-50 dark:bg-brand-950/30" : "hover:bg-accent/30"
      )}
    >
      {/* Checkbox / avatar */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-bold text-white">
        {candidate.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
      </div>

      {/* Name + title */}
      <div className="min-w-0 w-48 shrink-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-foreground truncate">{candidate.name}</p>
          <button onClick={(e) => { e.stopPropagation(); onStar(); }}>
            {candidate.starred
              ? <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" />
              : <StarOff className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
            }
          </button>
        </div>
        <p className="text-xs text-muted-foreground truncate">{candidate.title}</p>
      </div>

      {/* Company + location */}
      <div className="min-w-0 flex-1 hidden md:block">
        <p className="text-xs text-foreground truncate">{candidate.company}</p>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <MapPin className="h-3 w-3" />{candidate.location}
        </div>
      </div>

      {/* Skills */}
      <div className="hidden lg:flex items-center gap-1 flex-1 min-w-0">
        {candidate.skills.slice(0, 3).map(skill => (
          <span key={skill} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground shrink-0">
            {skill}
          </span>
        ))}
        {candidate.skills.length > 3 && (
          <span className="text-[10px] text-muted-foreground">+{candidate.skills.length - 3}</span>
        )}
      </div>

      {/* Experience */}
      <div className="w-16 shrink-0 text-right hidden sm:block">
        <p className="text-xs text-foreground">{candidate.experience}y exp</p>
        {candidate.salary && (
          <p className="text-[10px] text-muted-foreground">{formatSalary(candidate.salary.min)}+</p>
        )}
      </div>

      {/* Availability */}
      <div className="w-28 shrink-0 hidden md:flex items-center gap-1.5">
        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", AVAILABILITY_DOT[candidate.availability])} />
        <span className="text-[10px] text-muted-foreground">{AVAILABILITY_LABELS[candidate.availability]}</span>
      </div>

      {/* Match score */}
      <div className={cn(
        "w-16 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-center",
        matchScoreColor(candidate.matchScore)
      )}>
        {candidate.matchScore}%
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onOutreach(); }}
          className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent transition-colors"
        >
          <Mail className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onAddToPipeline(); }}
          disabled={candidate.inPipeline}
          className={cn(
            "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
            candidate.inPipeline
              ? "bg-teal-50 text-teal-600 cursor-not-allowed"
              : "bg-brand-600 text-white hover:bg-brand-700"
          )}
        >
          <UserPlus className="h-3 w-3" />
          {candidate.inPipeline ? "Added" : "Add"}
        </button>
      </div>
    </div>
  );
}

// ─── Filter Panel ─────────────────────────────────────────────────────────────

function FilterPanel({
  filters,
  onChange,
  onReset,
}: {
  filters: SearchFilters;
  onChange: (f: Partial<SearchFilters>) => void;
  onReset: () => void;
}) {
  const [skillInput, setSkillInput] = useState("");
  const [locInput, setLocInput]     = useState("");

  function addSkill(s: string) {
    if (!filters.skills.includes(s)) {
      onChange({ skills: [...filters.skills, s] });
    }
    setSkillInput("");
  }

  function removeSkill(s: string) {
    onChange({ skills: filters.skills.filter(x => x !== s) });
  }

  function addLocation(l: string) {
    if (!filters.locations.includes(l)) {
      onChange({ locations: [...filters.locations, l] });
    }
    setLocInput("");
  }

  function removeLocation(l: string) {
    onChange({ locations: filters.locations.filter(x => x !== l) });
  }

  function toggleAvailability(a: string) {
    const avail = filters.availability.includes(a)
      ? filters.availability.filter(x => x !== a)
      : [...filters.availability, a];
    onChange({ availability: avail });
  }

  const activeCount = filters.skills.length + filters.locations.length + filters.availability.length +
    (filters.experienceMin > 0 ? 1 : 0) + (filters.salaryMin > 0 ? 1 : 0);

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Filters</span>
          {activeCount > 0 && (
            <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{activeCount}</span>
          )}
        </div>
        {activeCount > 0 && (
          <button onClick={onReset} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
            <X className="h-3 w-3" />Clear all
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

        {/* Skills */}
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Skills</p>
          <div className="flex flex-wrap gap-1 mb-2">
            {filters.skills.map(skill => (
              <span key={skill} className="flex items-center gap-1 rounded-full bg-brand-100 dark:bg-brand-900/40 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:text-brand-300">
                {skill}
                <button onClick={() => removeSkill(skill)}><X className="h-2.5 w-2.5" /></button>
              </span>
            ))}
          </div>
          <input
            type="text"
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && skillInput.trim()) addSkill(skillInput.trim()); }}
            placeholder="Add skill…"
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-brand-400 mb-1"
          />
          <div className="flex flex-wrap gap-1">
            {SKILL_SUGGESTIONS.filter(s => !filters.skills.includes(s) && (!skillInput || s.toLowerCase().includes(skillInput.toLowerCase()))).slice(0, 6).map(s => (
              <button
                key={s}
                onClick={() => addSkill(s)}
                className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50 transition-colors"
              >
                + {s}
              </button>
            ))}
          </div>
        </div>

        {/* Location */}
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Location</p>
          <div className="flex flex-wrap gap-1 mb-2">
            {filters.locations.map(loc => (
              <span key={loc} className="flex items-center gap-1 rounded-full bg-brand-100 dark:bg-brand-900/40 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:text-brand-300">
                {loc}
                <button onClick={() => removeLocation(loc)}><X className="h-2.5 w-2.5" /></button>
              </span>
            ))}
          </div>
          <input
            type="text"
            value={locInput}
            onChange={(e) => setLocInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && locInput.trim()) addLocation(locInput.trim()); }}
            placeholder="Add location…"
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-brand-400 mb-1"
          />
          <div className="flex flex-col gap-1">
            {LOCATION_SUGGESTIONS.filter(l => !filters.locations.includes(l) && (!locInput || l.toLowerCase().includes(locInput.toLowerCase()))).slice(0, 5).map(l => (
              <button key={l} onClick={() => addLocation(l)} className="text-left rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                + {l}
              </button>
            ))}
          </div>
        </div>

        {/* Experience */}
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Experience (years)</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={filters.experienceMin || ""}
              onChange={(e) => onChange({ experienceMin: Number(e.target.value) })}
              placeholder="Min"
              min={0}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-brand-400"
            />
            <span className="text-xs text-muted-foreground shrink-0">to</span>
            <input
              type="number"
              value={filters.experienceMax || ""}
              onChange={(e) => onChange({ experienceMax: Number(e.target.value) })}
              placeholder="Max"
              min={0}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-brand-400"
            />
          </div>
        </div>

        {/* Salary */}
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Salary Range (USD)</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={filters.salaryMin || ""}
              onChange={(e) => onChange({ salaryMin: Number(e.target.value) })}
              placeholder="Min"
              step={10000}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-brand-400"
            />
            <span className="text-xs text-muted-foreground shrink-0">to</span>
            <input
              type="number"
              value={filters.salaryMax || ""}
              onChange={(e) => onChange({ salaryMax: Number(e.target.value) })}
              placeholder="Max"
              step={10000}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-brand-400"
            />
          </div>
        </div>

        {/* Availability */}
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Availability</p>
          <div className="space-y-1.5">
            {Object.entries(AVAILABILITY_LABELS).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer group">
                <div
                  onClick={() => toggleAvailability(key)}
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded border transition-colors",
                    filters.availability.includes(key)
                      ? "border-brand-600 bg-brand-600"
                      : "border-border group-hover:border-brand-400"
                  )}
                >
                  {filters.availability.includes(key) && <Check className="h-2.5 w-2.5 text-white" />}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={cn("h-1.5 w-1.5 rounded-full", AVAILABILITY_DOT[key])} />
                  <span className="text-xs text-foreground">{label}</span>
                </div>
              </label>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Default Filters ──────────────────────────────────────────────────────────

const DEFAULT_FILTERS: SearchFilters = {
  titles: [],
  skills: [],
  locations: [],
  experienceMin: 0,
  experienceMax: 0,
  salaryMin: 0,
  salaryMax: 0,
  availability: [],
  companies: [],
  education: [],
};

// ─── Page ─────────────────────────────────────────────────────────────────────

type ViewMode = "grid" | "list";

export default function SourcingPage() {
  const { candidates: rawCandidates, loading: candidatesLoading } = useCandidates();
  const { savedSearches, saveSearch, deleteSearch }               = useSavedSearches();

  const [query, setQuery]           = useState("");
  const [filters, setFilters]       = useState<SearchFilters>(DEFAULT_FILTERS);
  const [viewMode, setViewMode]     = useState<ViewMode>("list");
  const [showFilters, setShowFilters] = useState(true);
  const [aiMode, setAiMode]         = useState(false); // US-116: NL Talent Query
  const [showSaved, setShowSaved]     = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedCandidate, setSelectedCandidate] = useState<SourcingCandidate | null>(null);
  // Ephemeral UI state for starred/in-pipeline (no DB fields yet)
  const [starredIds,   setStarredIds]   = useState<Set<string>>(new Set());
  const [pipelineIds,  setPipelineIds]  = useState<Set<string>>(new Set());
  // Save search dialog
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState("");
  const [savingSearch,   setSavingSearch]   = useState(false);

  // Map real Candidate → SourcingCandidate for the UI
  const candidates: SourcingCandidate[] = useMemo(() =>
    rawCandidates.map((c): SourcingCandidate => ({
      id:          c.id,
      name:        `${c.firstName} ${c.lastName}`,
      title:       c.currentTitle ?? "",
      company:     c.currentCompany ?? "",
      location:    c.location?.city ?? "",
      experience:  0,   // not stored in DB yet
      skills:      c.skills.map((s) => s.skill.name),
      availability: (c.source === "inbound" ? "immediately" : "passive") as SourcingCandidate["availability"],
      email:       c.email || undefined,
      phone:       c.phone ?? undefined,
      linkedinUrl: c.linkedinUrl ?? undefined,
      summary:     "",  // not stored in DB yet
      starred:     starredIds.has(c.id),
      inPipeline:  pipelineIds.has(c.id),
      tags:        [],
      source:      (["linkedin","github","referral","database","website"].includes(c.source ?? "")
                     ? c.source as SourcingCandidate["source"]
                     : "database"),
      matchScore:  70,  // placeholder until vector search is wired
    }))
  , [rawCandidates, starredIds, pipelineIds]);

  function updateFilters(patch: Partial<SearchFilters>) {
    setFilters(prev => ({ ...prev, ...patch }));
  }

  function resetFilters() {
    setFilters(DEFAULT_FILTERS);
    setQuery("");
  }

  function handleStar(id: string) {
    setStarredIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleAddToPipeline(id: string) {
    if (pipelineIds.has(id)) return;
    const c = candidates.find(x => x.id === id);
    setPipelineIds(prev => new Set([...prev, id]));
    toast.success(`${c?.name ?? "Candidate"} added to pipeline`);
  }

  function handleOutreach(candidate: SourcingCandidate) {
    toast.success(`Opening compose for ${candidate.name}`);
  }

  function handleBulkAddToPipeline() {
    const toAdd = [...selectedIds].filter(id => !pipelineIds.has(id));
    setPipelineIds(prev => new Set([...prev, ...toAdd]));
    toast.success(`${toAdd.length} candidate${toAdd.length !== 1 ? "s" : ""} added to pipeline`);
    setSelectedIds(new Set());
  }

  function handleBulkOutreach() {
    toast.success(`Outreach sequence opened for ${selectedIds.size} candidates`);
    setSelectedIds(new Set());
  }

  function handleNLAddToPipeline(candidate: TalentQueryResult) {
    setPipelineIds(prev => new Set([...prev, candidate.id]));
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSaveSearch() {
    if (!saveSearchName.trim()) return;
    setSavingSearch(true);
    const result = await saveSearch(
      saveSearchName.trim(),
      query,
      filters as unknown as Record<string, unknown>,
      filtered.length
    );
    setSavingSearch(false);
    if (result) {
      toast.success(`"${saveSearchName.trim()}" saved`);
      setSaveSearchName("");
      setShowSaveDialog(false);
    } else {
      toast.error("Failed to save search");
    }
  }

  const filtered = useMemo(() => {
    return candidates.filter(c => {
      // Query match
      if (query) {
        const q = query.toLowerCase();
        const inName    = c.name.toLowerCase().includes(q);
        const inTitle   = c.title.toLowerCase().includes(q);
        const inCompany = c.company.toLowerCase().includes(q);
        const inSkills  = c.skills.some(s => s.toLowerCase().includes(q));
        const inSummary = c.summary.toLowerCase().includes(q);
        if (!inName && !inTitle && !inCompany && !inSkills && !inSummary) return false;
      }
      // Skills filter
      if (filters.skills.length > 0) {
        const hasAll = filters.skills.every(fs => c.skills.some(s => s.toLowerCase().includes(fs.toLowerCase())));
        if (!hasAll) return false;
      }
      // Location filter
      if (filters.locations.length > 0) {
        const match = filters.locations.some(fl => c.location.toLowerCase().includes(fl.toLowerCase()));
        if (!match) return false;
      }
      // Experience filter — skip when experience is unknown (0)
      if (filters.experienceMin > 0 && c.experience > 0 && c.experience < filters.experienceMin) return false;
      if (filters.experienceMax > 0 && c.experience > 0 && c.experience > filters.experienceMax) return false;
      // Salary filter
      if (filters.salaryMin > 0 && c.salary && c.salary.max < filters.salaryMin) return false;
      if (filters.salaryMax > 0 && c.salary && c.salary.min > filters.salaryMax) return false;
      // Availability filter
      if (filters.availability.length > 0 && c.availability !== "passive" && !filters.availability.includes(c.availability)) return false;
      return true;
    }).sort((a, b) => b.matchScore - a.matchScore);
  }, [candidates, query, filters]);

  const activeFilterCount = filters.skills.length + filters.locations.length + filters.availability.length +
    (filters.experienceMin > 0 ? 1 : 0) + (filters.salaryMin > 0 ? 1 : 0);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Page header */}
      <div className="shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Sourcing</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Find and shortlist candidates from your talent database</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSaved(prev => !prev)}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-3.5 py-2 text-sm font-medium transition-colors",
                showSaved ? "border-brand-400 bg-brand-50 text-brand-700" : "border-border text-muted-foreground hover:bg-accent"
              )}
            >
              <History className="h-4 w-4" />Saved Searches
              {savedSearches.length > 0 && (
                <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px]">{savedSearches.length}</span>
              )}
            </button>
            <div className="relative">
              <button
                onClick={() => setShowSaveDialog(prev => !prev)}
                className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                <BookmarkPlus className="h-4 w-4" />Save Search
              </button>
              {showSaveDialog && (
                <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-lg border border-border bg-card shadow-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-foreground">Name this search</p>
                  <input
                    autoFocus
                    value={saveSearchName}
                    onChange={(e) => setSaveSearchName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveSearch(); if (e.key === "Escape") setShowSaveDialog(false); }}
                    placeholder="e.g., VP Eng – Fintech"
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowSaveDialog(false)} className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                    <button
                      disabled={!saveSearchName.trim() || savingSearch}
                      onClick={handleSaveSearch}
                      className="px-3 py-1 rounded-md bg-brand-600 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      {savingSearch ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Search bar + AI mode toggle */}
        <div className="flex items-center gap-2">
          {/* AI mode toggle */}
          <button
            onClick={() => setAiMode(prev => !prev)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3.5 py-2.5 text-sm font-medium transition-colors shrink-0",
              aiMode
                ? "border-brand-400 bg-brand-600 text-white"
                : "border-border text-muted-foreground hover:bg-accent"
            )}
            title="AI Talent Search — describe who you're looking for in plain English"
          >
            <Sparkles className="h-4 w-4" />
            AI Search
          </button>

          {/* Regular search — hidden in AI mode */}
          {!aiMode && (
            <>
              <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-brand-400 focus-within:border-brand-400 transition-all">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, title, company, skill, or keyword…"
                  className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground text-foreground"
                />
                {query && (
                  <button onClick={() => setQuery("")}>
                    <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
              </div>
              <button
                onClick={() => setShowFilters(prev => !prev)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3.5 py-2.5 text-sm font-medium transition-colors",
                  showFilters || activeFilterCount > 0
                    ? "border-brand-400 bg-brand-50 text-brand-700"
                    : "border-border text-muted-foreground hover:bg-accent"
                )}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{activeFilterCount}</span>
                )}
              </button>
            </>
          )}
          {!aiMode && (
            <div className="flex items-center rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setViewMode("list")}
                className={cn(
                  "flex items-center justify-center px-2.5 py-2.5 transition-colors",
                  viewMode === "list" ? "bg-brand-50 text-brand-600" : "text-muted-foreground hover:bg-accent"
                )}
              >
                <List className="h-4 w-4" />
              </button>
              <div className="w-px h-full bg-border" />
              <button
                onClick={() => setViewMode("grid")}
                className={cn(
                  "flex items-center justify-center px-2.5 py-2.5 transition-colors",
                  viewMode === "grid" ? "bg-brand-50 text-brand-600" : "text-muted-foreground hover:bg-accent"
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* AI Search mode — full-height panel */}
      {aiMode && (
        <div className="flex-1 overflow-hidden">
          <NLTalentQuery onAddToPipeline={handleNLAddToPipeline} />
        </div>
      )}

      {/* Body (standard filter mode) */}
      {!aiMode && <div className="flex flex-1 overflow-hidden">

        {/* Saved searches sidebar */}
        {showSaved && (
          <div className="w-64 shrink-0 border-r border-border flex flex-col overflow-hidden">
            <div className="shrink-0 border-b border-border px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">Saved Searches</span>
              <button onClick={() => setShowSaved(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {savedSearches.length === 0 && (
                <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">No saved searches yet</p>
              )}
              {savedSearches.map(ss => (
                <div key={ss.id} className="group relative">
                  <button
                    onClick={() => {
                      setQuery(ss.query);
                      const ssFilters = (ss as { filters?: unknown }).filters;
                      if (ssFilters) updateFilters(ssFilters as Partial<SearchFilters>);
                      setShowSaved(false);
                    }}
                    className="w-full text-left rounded-lg border border-border p-3 hover:bg-accent/50 hover:border-brand-200 transition-colors"
                  >
                    <p className="text-xs font-medium text-foreground leading-tight pr-5">{ss.name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground truncate">{ss.query || "No query"}</p>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">{ss.resultCount} results</span>
                      <span className="text-[10px] text-muted-foreground">{formatRelativeTime(ss.createdAt)}</span>
                    </div>
                  </button>
                  <button
                    onClick={() => deleteSearch(ss.id)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 rounded p-0.5 text-muted-foreground hover:text-red-600 transition-all"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter panel */}
        {showFilters && (
          <div className="w-56 shrink-0 border-r border-border overflow-hidden">
            <FilterPanel filters={filters} onChange={updateFilters} onReset={resetFilters} />
          </div>
        )}

        {/* Results */}
        <div className="flex flex-1 flex-col overflow-hidden">

          {/* Results bar */}
          <div className="shrink-0 border-b border-border bg-card px-5 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{filtered.length}</span>
                {" "}candidate{filtered.length !== 1 ? "s" : ""}
                {(query || activeFilterCount > 0) && " matching"}
              </p>
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-brand-600 font-medium">{selectedIds.size} selected</span>
                  <button
                    onClick={handleBulkAddToPipeline}
                    className="flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-700 transition-colors"
                  >
                    <UserPlus className="h-3 w-3" />Add to Pipeline
                  </button>
                  <button
                    onClick={handleBulkOutreach}
                    className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent transition-colors"
                  >
                    <SendHorizonal className="h-3 w-3" />Outreach
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Sort: Match Score</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </div>
          </div>

          {/* Candidate list / grid */}
          <div className={cn(
            "flex-1 overflow-y-auto",
            viewMode === "grid" && "p-5"
          )}>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <Search className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm font-medium text-foreground">No candidates found</p>
                <p className="mt-1 text-xs text-muted-foreground">Try adjusting your search or filters</p>
                <button onClick={resetFilters} className="mt-3 text-xs text-brand-600 hover:underline">Clear all filters</button>
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map(c => (
                  <CandidateCard
                    key={c.id}
                    candidate={c}
                    isSelected={selectedIds.has(c.id)}
                    onSelect={() => toggleSelect(c.id)}
                    onStar={() => handleStar(c.id)}
                    onAddToPipeline={() => handleAddToPipeline(c.id)}
                    onOutreach={() => handleOutreach(c)}
                  />
                ))}
              </div>
            ) : (
              <div>
                {/* List header */}
                <div className="flex items-center gap-4 px-5 py-2 border-b border-border bg-muted/30 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <div className="w-9 shrink-0" />
                  <div className="w-48 shrink-0">Candidate</div>
                  <div className="flex-1 hidden md:block">Company / Location</div>
                  <div className="flex-1 hidden lg:block">Skills</div>
                  <div className="w-16 shrink-0 text-right hidden sm:block">Exp</div>
                  <div className="w-28 shrink-0 hidden md:block">Availability</div>
                  <div className="w-16 shrink-0 text-center">Match</div>
                  <div className="w-20 shrink-0" />
                </div>
                {filtered.map(c => (
                  <CandidateRow
                    key={c.id}
                    candidate={c}
                    isSelected={selectedIds.has(c.id)}
                    onSelect={() => toggleSelect(c.id)}
                    onStar={() => handleStar(c.id)}
                    onAddToPipeline={() => handleAddToPipeline(c.id)}
                    onOutreach={() => handleOutreach(c)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>}
    </div>
  );
}
