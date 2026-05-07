"use client";

import { useState, useCallback, useRef } from "react";
import type { CandidateSearchResult } from "@/app/api/candidates/search/route";
import { useRouter } from "next/navigation";
import { Plus, Search, Users, SlidersHorizontal, Bell, BellOff, BookmarkPlus, Bookmark, X, ChevronDown, Check, Upload, Mail, Download, GitMerge, Sparkles, Loader as Loader2, Code as Code2, Copy, ChevronRight } from "lucide-react";
import Link from "next/link";
import { CandidateTable } from "@/components/candidates/candidate-table";
import { useCandidates, usePendingEmailMatches, useSavedSearches, useTags, useDuplicates, type NewCandidateInput, type SavedSearch } from "@/lib/supabase/hooks";
import { AddCandidateModal, type NewCandidateData } from "@/components/candidates/add-candidate-modal";
import { CandidateImportModal } from "@/components/candidates/import-modal";
import { FuzzyReviewInbox } from "@/components/email/FuzzyReviewInbox";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Candidate } from "@/types";

// ─── Save Search Modal ────────────────────────────────────────────────────────

interface SaveSearchModalProps {
  query: string;
  statusFilter: string;
  sourceFilter: string;
  resultCount: number;
  onSave: (search: Omit<SavedSearch, "id" | "createdAt">) => void;
  onClose: () => void;
}

function SaveSearchModal({ query, statusFilter, sourceFilter, resultCount, onSave, onClose }: SaveSearchModalProps) {
  const [name, setName]           = useState(
    [query, statusFilter !== "all" ? statusFilter : "", sourceFilter !== "all" ? sourceFilter : ""]
      .filter(Boolean).join(" · ") || "My search"
  );
  const [alerts, setAlerts]       = useState(true);
  const [frequency, setFrequency] = useState<"instant" | "daily" | "weekly">("daily");

  function handleSave() {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      query,
      statusFilter,
      sourceFilter,
      alertsEnabled: alerts,
      alertFrequency: frequency,
      resultCount,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Save Search</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">Search name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="e.g. Active senior engineers in NYC"
            />
          </div>

          {/* Filter summary */}
          <div className="rounded-lg bg-muted/50 p-3 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Filters saved</p>
            {query && (
              <div className="flex items-center gap-2 text-xs text-foreground">
                <Search className="h-3 w-3 text-muted-foreground" />
                <span>"{query}"</span>
              </div>
            )}
            {statusFilter !== "all" && (
              <div className="flex items-center gap-2 text-xs text-foreground">
                <span className="h-3 w-3 text-muted-foreground text-center">S</span>
                <span>Status: {statusFilter}</span>
              </div>
            )}
            {sourceFilter !== "all" && (
              <div className="flex items-center gap-2 text-xs text-foreground">
                <span className="h-3 w-3 text-muted-foreground text-center">↗</span>
                <span>Source: {sourceFilter}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              <span>{resultCount} candidates match</span>
            </div>
          </div>

          {/* Alerts */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs font-medium text-foreground">Email alerts</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Get notified when new candidates match this search</p>
              </div>
              <button
                onClick={() => setAlerts((v) => !v)}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
                  alerts ? "bg-brand-600" : "bg-muted"
                )}
              >
                <span className={cn(
                  "inline-block h-3.5 w-3.5 rounded-full bg-card shadow-sm transition-transform",
                  alerts ? "translate-x-4" : "translate-x-1"
                )} />
              </button>
            </div>

            {alerts && (
              <div>
                <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">Alert frequency</p>
                <div className="flex gap-2">
                  {(["instant", "daily", "weekly"] as const).map((freq) => (
                    <button
                      key={freq}
                      onClick={() => setFrequency(freq)}
                      className={cn(
                        "flex-1 rounded-md border px-2 py-1.5 text-xs font-medium capitalize transition-colors",
                        frequency === freq
                          ? "border-brand-300 bg-brand-50 text-brand-700"
                          : "border-border text-muted-foreground hover:bg-accent"
                      )}
                    >
                      {freq === "instant" ? "Instant" : freq.charAt(0).toUpperCase() + freq.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="rounded-md bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40 transition-colors"
          >
            Save Search
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Saved Searches Drawer ────────────────────────────────────────────────────

interface SavedSearchesDrawerProps {
  searches: SavedSearch[];
  onApply: (s: SavedSearch) => void;
  onToggleAlert: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

function SavedSearchesDrawer({ searches, onApply, onToggleAlert, onDelete, onClose }: SavedSearchesDrawerProps) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative ml-auto flex h-full w-80 flex-col border-l border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Saved Searches</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {searches.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <Bookmark className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-foreground">No saved searches</p>
              <p className="mt-1 text-xs text-muted-foreground">Save a search to quickly re-run your most common filters</p>
            </div>
          )}
          {searches.map((s) => (
            <div key={s.id} className="border-b border-border px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <button
                  onClick={() => { onApply(s); onClose(); }}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="text-sm font-medium text-foreground hover:text-brand-600 transition-colors">{s.name}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{s.resultCount} candidates</p>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => onToggleAlert(s.id)}
                    title={s.alertsEnabled ? "Disable alerts" : "Enable alerts"}
                    className={cn(
                      "rounded-md p-1.5 transition-colors",
                      s.alertsEnabled ? "text-brand-600 hover:bg-brand-50" : "text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {s.alertsEnabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => onDelete(s.id)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {s.query && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">
                    "{s.query}"
                  </span>
                )}
                {s.statusFilter !== "all" && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground capitalize">
                    {s.statusFilter}
                  </span>
                )}
                {s.sourceFilter !== "all" && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">
                    {s.sourceFilter}
                  </span>
                )}
                {s.alertsEnabled && (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">
                    {s.alertFrequency} alerts
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-border px-4 py-3">
          <p className="text-[10px] text-muted-foreground">
            Alerts send to <span className="font-medium text-foreground">alex@agency.com</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CandidatesPage() {
  const router = useRouter();
  const { candidates, loading, addCandidate } = useCandidates();
  const { count: pendingMatchCount } = usePendingEmailMatches();
  const { groups: dupGroups } = useDuplicates(candidates);
  const dupCount = dupGroups.length;
  const { searches: savedSearches, createSearch, toggleAlert, deleteSearch } = useSavedSearches();
  const { tags: allTags } = useTags();
  const [showAddModal, setShowAddModal]       = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSaveModal, setShowSaveModal]     = useState(false);
  const [showSavedDrawer, setShowSavedDrawer] = useState(false);
  const [showFuzzyInbox, setShowFuzzyInbox]   = useState(false);
  const [searchQuery, setSearchQuery]   = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [tagFilter, setTagFilter]       = useState<string>("all");

  // AI semantic search state
  const [aiMode, setAiMode]                 = useState(false);
  const [aiQuery, setAiQuery]               = useState("");
  const [aiSearching, setAiSearching]       = useState(false);
  const [aiResults, setAiResults]           = useState<CandidateSearchResult[] | null>(null);
  const [aiSearchMode, setAiSearchMode]     = useState<"vector" | "ilike" | null>(null);
  const aiInputRef = useRef<HTMLInputElement>(null);

  // Boolean search state — US-383
  const [booleanOpen, setBooleanOpen]       = useState(false);
  const [booleanDesc, setBooleanDesc]       = useState("");
  const [booleanResult, setBooleanResult]   = useState<{ boolean: string; clauses: { clause: string; explanation: string }[]; tips: string[] } | null>(null);
  const [booleanGenerating, setBooleanGenerating] = useState(false);
  const [booleanEdited, setBooleanEdited]   = useState("");

  const generateBoolean = useCallback(async () => {
    if (!booleanDesc.trim()) return;
    setBooleanGenerating(true);
    setBooleanResult(null);
    try {
      const res = await fetch("/api/ai/boolean-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: booleanDesc.trim() }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBooleanResult(data);
      setBooleanEdited(data.boolean);
    } catch {
      toast.error("Boolean generation failed");
    } finally {
      setBooleanGenerating(false);
    }
  }, [booleanDesc]);

  const runAiSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setAiResults(null); return; }
    setAiSearching(true);
    try {
      const res = await fetch("/api/candidates/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q.trim(), limit: 30 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAiResults(data.candidates);
      setAiSearchMode(data.mode);
    } catch {
      toast.error("AI search failed");
      setAiResults(null);
    } finally {
      setAiSearching(false);
    }
  }, []);

  const filteredCandidates = candidates.filter((c) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !c.fullName.toLowerCase().includes(q) &&
        !c.currentTitle?.toLowerCase().includes(q) &&
        !c.currentCompany?.toLowerCase().includes(q)
      ) return false;
    }
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (sourceFilter !== "all" && c.source !== sourceFilter) return false;
    if (tagFilter !== "all" && !c.tags.some((t) => t.id === tagFilter)) return false;
    return true;
  });

  const hasActiveFilters = !!searchQuery || statusFilter !== "all" || sourceFilter !== "all" || tagFilter !== "all";
  const alertSearches = savedSearches.filter((s) => s.alertsEnabled);

  async function handleAddCandidate(data: NewCandidateData) {
    const result = await addCandidate({
      firstName:      data.firstName,
      lastName:       data.lastName,
      email:          data.email,
      phone:          data.phone,
      currentTitle:   data.currentTitle,
      currentCompany: data.currentCompany,
      location:       data.location,
      source:         data.source,
    });
    setShowAddModal(false);
    if (result) {
      toast.success("Candidate added");
    } else {
      toast.error("Failed to add candidate");
    }
  }

  async function handleSaveSearch(data: Omit<SavedSearch, "id" | "createdAt">) {
    const result = await createSearch(data);
    if (result) toast.success(`Search saved${data.alertsEnabled ? ` · ${data.alertFrequency} alerts on` : ""}`);
    else toast.error("Failed to save search");
  }

  function applySearch(s: SavedSearch) {
    setSearchQuery(s.query);
    setStatusFilter(s.statusFilter);
    setSourceFilter(s.sourceFilter);
    toast.success(`Applied "${s.name}"`);
  }

  async function handleToggleAlert(id: string) {
    await toggleAlert(id);
  }

  async function handleDeleteSearch(id: string) {
    await deleteSearch(id);
    toast.success("Search removed");
  }

  function clearFilters() {
    setSearchQuery("");
    setStatusFilter("all");
    setSourceFilter("all");
    setTagFilter("all");
  }

  function handleExportCandidates() {
    const cols = ["ID","Name","Email","Phone","Title","Company","Location","Status","Source","Created"];
    const rows = filteredCandidates.map((c) => [
      c.id,
      c.fullName,
      c.email ?? "",
      c.phone ?? "",
      c.currentTitle ?? "",
      c.currentCompany ?? "",
      c.location ?? "",
      c.status ?? "",
      c.source ?? "",
      c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "",
    ]);
    const csv = [cols, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url; a.download = `candidates-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredCandidates.length} candidates`);
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Candidates</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {loading ? "Loading…" : `${filteredCandidates.length} of ${candidates.length} candidates`}
              {alertSearches.length > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 text-brand-600">
                  · <Bell className="h-3 w-3" />{alertSearches.length} alert{alertSearches.length !== 1 ? "s" : ""} active
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Duplicate detection button */}
            {dupCount > 0 && (
              <Link
                href="/candidates/duplicates"
                className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors"
              >
                <GitMerge className="h-3.5 w-3.5" />
                Duplicates
                <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white leading-4">
                  {dupCount}
                </span>
              </Link>
            )}

            {/* Fuzzy email match review button */}
            {pendingMatchCount > 0 && (
              <button
                onClick={() => setShowFuzzyInbox(true)}
                className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
              >
                <Mail className="h-3.5 w-3.5" />
                Review matches
                <span className="rounded-full bg-amber-600 px-1.5 text-[10px] font-bold text-white leading-4">
                  {pendingMatchCount}
                </span>
              </button>
            )}

            {/* Saved searches button */}
            <button
              onClick={() => setShowSavedDrawer(true)}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                savedSearches.length > 0
                  ? "border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100"
                  : "border-border text-muted-foreground hover:bg-accent"
              )}
            >
              <Bookmark className="h-3.5 w-3.5" />
              Saved
              {savedSearches.length > 0 && (
                <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white leading-4">
                  {savedSearches.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3.5 py-1.5 text-sm font-medium text-foreground hover:bg-accent transition-colors"
            >
              <Upload className="h-4 w-4" />Import CSV
            </button>
            <button
              onClick={handleExportCandidates}
              disabled={filteredCandidates.length === 0}
              className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3.5 py-1.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-40 transition-colors"
            >
              <Download className="h-4 w-4" />Export CSV
            </button>
            <button
              onClick={() => router.push("/candidates/new")}
              className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              <Plus className="h-4 w-4" />Add Candidate
            </button>
          </div>
        </div>

        {/* Search + filters */}
        <div className="mt-4 flex items-center gap-2">
          {/* AI Search toggle */}
          <button
            onClick={() => {
              setAiMode((v) => {
                if (!v) { setAiResults(null); setAiQuery(""); setBooleanOpen(false); }
                return !v;
              });
              setTimeout(() => aiInputRef.current?.focus(), 50);
            }}
            title={aiMode ? "Switch to keyword search" : "Switch to AI semantic search"}
            className={cn(
              "shrink-0 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
              aiMode
                ? "border-brand-400 bg-brand-600 text-white hover:bg-brand-700"
                : "border-border text-muted-foreground hover:bg-accent"
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />AI
          </button>

          {/* Boolean search generator toggle — US-383 */}
          <button
            onClick={() => { setBooleanOpen((v) => !v); if (aiMode) { setAiMode(false); setAiResults(null); } }}
            title="Build with AI — generate a Boolean search string"
            className={cn(
              "shrink-0 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
              booleanOpen
                ? "border-violet-400 bg-violet-600 text-white hover:bg-violet-700"
                : "border-border text-muted-foreground hover:bg-accent"
            )}
          >
            <Code2 className="h-3.5 w-3.5" />Boolean
          </button>

          <div className="relative flex-1">
            {aiMode ? (
              <>
                <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-500" />
                {aiSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />}
                <input
                  ref={aiInputRef}
                  type="text"
                  placeholder='Try "senior React engineers with fintech experience in NYC"…'
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") runAiSearch(aiQuery); }}
                  className="w-full rounded-lg border border-brand-300 bg-background py-2 pl-9 pr-8 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
                />
                {aiResults !== null && (
                  <div className="absolute right-10 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <span className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      aiSearchMode === "vector" ? "bg-brand-100 text-brand-700" : "bg-muted text-muted-foreground"
                    )}>
                      {aiSearchMode === "vector" ? "✦ vector" : "keyword"}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by name, title, or company…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
                />
              </>
            )}
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="passive">Passive</option>
            <option value="placed">Placed</option>
            <option value="do_not_contact">Do Not Contact</option>
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">All Sources</option>
            <option value="LinkedIn">LinkedIn</option>
            <option value="Referral">Referral</option>
            <option value="Database">Database</option>
            <option value="Inbound">Inbound</option>
          </select>

          {allTags.length > 0 && (
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="all">All Tags</option>
              {allTags.map((tag) => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>
          )}

          {/* Save search button (only when filters active) */}
          {hasActiveFilters && (
            <button
              onClick={() => setShowSaveModal(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-brand-300 bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors"
            >
              <BookmarkPlus className="h-3.5 w-3.5" />Save
            </button>
          )}

          {/* Clear filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-2 text-xs text-muted-foreground hover:bg-accent transition-colors"
            >
              <X className="h-3.5 w-3.5" />Clear
            </button>
          )}
        </div>

        {/* Boolean Search Generator panel — US-383 */}
        {booleanOpen && (
          <div className="mt-3 rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-brand-50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-violet-600" />
              <p className="text-sm font-semibold text-violet-900">Build with AI — Boolean Search</p>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder='e.g. "senior Java engineers, fintech background, not visa-sponsored"'
                value={booleanDesc}
                onChange={(e) => setBooleanDesc(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") generateBoolean(); }}
                className="flex-1 rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-violet-400"
              />
              <button
                onClick={generateBoolean}
                disabled={booleanGenerating || !booleanDesc.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                {booleanGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Generate
              </button>
            </div>

            {booleanResult && (
              <div className="space-y-3">
                {/* Editable Boolean string */}
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-700">Boolean String</p>
                  <div className="flex gap-2 items-start">
                    <textarea
                      value={booleanEdited}
                      onChange={(e) => setBooleanEdited(e.target.value)}
                      rows={2}
                      className="flex-1 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-mono text-foreground outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                    />
                    <button
                      onClick={() => { navigator.clipboard.writeText(booleanEdited); toast.success("Copied to clipboard"); }}
                      className="shrink-0 flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-2.5 py-2 text-xs text-violet-700 hover:bg-violet-50 transition-colors"
                    >
                      <Copy className="h-3.5 w-3.5" />Copy
                    </button>
                  </div>
                </div>

                {/* Clause breakdown */}
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-700">Clause Breakdown</p>
                  <div className="space-y-1">
                    {booleanResult.clauses.map((c, i) => (
                      <div key={i} className="flex gap-2 text-xs">
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-violet-400 mt-0.5" />
                        <span className="font-mono text-violet-800 shrink-0">{c.clause}</span>
                        <span className="text-muted-foreground">— {c.explanation}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tips */}
                {booleanResult.tips.length > 0 && (
                  <div className="rounded-lg bg-violet-100/60 px-3 py-2 space-y-0.5">
                    {booleanResult.tips.map((tip, i) => (
                      <p key={i} className="text-[11px] text-violet-800">💡 {tip}</p>
                    ))}
                  </div>
                )}

                {/* Apply to search */}
                <button
                  onClick={() => {
                    setSearchQuery(booleanEdited);
                    setBooleanOpen(false);
                    toast.success("Boolean applied to search");
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-white border border-violet-200 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50 transition-colors"
                >
                  Apply to search
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {/* AI search results */}
        {aiMode && aiResults !== null ? (
          aiResults.length > 0 ? (
            <div>
              <div className="border-b border-border bg-muted/30 px-6 py-2 flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-brand-500" />
                <span className="text-xs text-muted-foreground">
                  {aiResults.length} semantic matches for "{aiQuery}"
                </span>
                <button
                  onClick={() => { setAiResults(null); setAiQuery(""); }}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <CandidateTable
                data={aiResults.map((r) => ({
                  id:             r.id,
                  fullName:       r.fullName,
                  firstName:      r.fullName?.split(" ")[0] ?? "",
                  lastName:       r.fullName?.split(" ").slice(1).join(" ") ?? "",
                  currentTitle:   r.currentTitle ?? undefined,
                  currentCompany: r.currentCompany ?? undefined,
                  location:       r.location ? { city: r.location } : undefined,
                  status:         (r.status ?? "active") as "active" | "passive" | "placed" | "do_not_contact",
                  skills:         r.skills.map((s) => ({ skillId: s, skill: { id: s, name: s, normalizedName: s }, source: "parsed" as const })),
                  tags:           [],
                  source:         undefined,
                  email:          "",
                  phone:          undefined,
                  createdAt:      new Date().toISOString(),
                  updatedAt:      new Date().toISOString(),
                  matchScore:     r.similarity,
                }))}
                onCompare={(ids) => router.push(`/candidates/compare?ids=${ids.join(",")}`)}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Sparkles className="mb-4 h-10 w-10 text-muted-foreground" />
              <h3 className="text-base font-semibold text-foreground">No semantic matches</h3>
              <p className="mt-1 text-sm text-muted-foreground">Try rewording your query or check that candidates have been indexed</p>
            </div>
          )
        ) : aiMode && aiSearching ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Loader2 className="mb-4 h-8 w-8 text-brand-500 animate-spin" />
            <p className="text-sm text-muted-foreground">Searching semantically…</p>
          </div>
        ) : filteredCandidates.length > 0 ? (
          <CandidateTable
            data={filteredCandidates}
            onCompare={(ids) => router.push(`/candidates/compare?ids=${ids.join(",")}`)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Users className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-base font-semibold text-foreground">No candidates found</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasActiveFilters ? "Try adjusting your filters" : "Add your first candidate to get started"}
            </p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="mt-3 text-xs text-brand-600 hover:underline">
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddCandidateModal onClose={() => setShowAddModal(false)} onAdd={handleAddCandidate} />
      )}
      {showImportModal && (
        <CandidateImportModal onClose={() => setShowImportModal(false)} />
      )}
      {showSaveModal && (
        <SaveSearchModal
          query={searchQuery}
          statusFilter={statusFilter}
          sourceFilter={sourceFilter}
          resultCount={filteredCandidates.length}
          onSave={handleSaveSearch}
          onClose={() => setShowSaveModal(false)}
        />
      )}
      {showSavedDrawer && (
        <SavedSearchesDrawer
          searches={savedSearches}
          onApply={applySearch}
          onToggleAlert={handleToggleAlert}
          onDelete={handleDeleteSearch}
          onClose={() => setShowSavedDrawer(false)}
        />
      )}
      {showFuzzyInbox && (
        <FuzzyReviewInbox onClose={() => setShowFuzzyInbox(false)} />
      )}
    </div>
  );
}
