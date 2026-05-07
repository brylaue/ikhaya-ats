"use client";

/**
 * JobIntakeForm — structured intake questionnaire for a job requisition.
 *
 * Reads and writes the `intake` JSONB column on the jobs table.
 * Auto-saves on blur with debounce.
 *
 * Intake fields (from migration 015_job_intake_custom_fields.sql schema):
 *   mustHaveSkills, niceToHaveSkills, targetCompanies, sourcingNotes,
 *   stakeholders, targetStartDate, latestFillDate, compApproved,
 *   hiringManagerName, hiringManagerEmail, openReqCount
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  CheckCircle2, Clock, Users, Target, Briefcase,
  Plus, Trash2, Loader2, Save, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Stakeholder {
  name:           string;
  role:           string;
  interviewStage: string;
}

export interface IntakeData {
  mustHaveSkills:     string[];
  niceToHaveSkills:   string[];
  targetCompanies:    string;
  sourcingNotes:      string;
  stakeholders:       Stakeholder[];
  targetStartDate:    string | null;
  latestFillDate:     string | null;
  compApproved:       boolean;
  hiringManagerName:  string;
  hiringManagerEmail: string;
  openReqCount:       number;
}

const DEFAULT_INTAKE: IntakeData = {
  mustHaveSkills:     [],
  niceToHaveSkills:   [],
  targetCompanies:    "",
  sourcingNotes:      "",
  stakeholders:       [],
  targetStartDate:    null,
  latestFillDate:     null,
  compApproved:       false,
  hiringManagerName:  "",
  hiringManagerEmail: "",
  openReqCount:       1,
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SkillChips({
  label,
  chips,
  onChange,
}: {
  label:    string;
  chips:    string[];
  onChange: (chips: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const trimmed = draft.trim();
    if (!trimmed || chips.includes(trimmed)) { setDraft(""); return; }
    onChange([...chips, trimmed]);
    setDraft("");
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5 min-h-[32px]">
        {chips.map((chip) => (
          <span
            key={chip}
            className="flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground"
          >
            {chip}
            <button
              type="button"
              onClick={() => onChange(chips.filter((c) => c !== chip))}
              className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
          }}
          placeholder="Type skill and press Enter…"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="h-3 w-3" />Add
        </button>
      </div>
    </div>
  );
}

function StakeholderTable({
  rows,
  onChange,
}: {
  rows:     Stakeholder[];
  onChange: (rows: Stakeholder[]) => void;
}) {
  function update(i: number, field: keyof Stakeholder, value: string) {
    const next = [...rows];
    next[i] = { ...next[i], [field]: value };
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Interview Panel / Stakeholders
      </label>
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-1.5 pr-3 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
                <th className="py-1.5 pr-3 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Role</th>
                <th className="py-1.5 pr-3 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Interview Stage</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {rows.map((row, i) => (
                <tr key={i}>
                  <td className="py-1.5 pr-3">
                    <input
                      value={row.name}
                      onChange={(e) => update(i, "name", e.target.value)}
                      placeholder="Name"
                      className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </td>
                  <td className="py-1.5 pr-3">
                    <input
                      value={row.role}
                      onChange={(e) => update(i, "role", e.target.value)}
                      placeholder="Title / role"
                      className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </td>
                  <td className="py-1.5 pr-3">
                    <input
                      value={row.interviewStage}
                      onChange={(e) => update(i, "interviewStage", e.target.value)}
                      placeholder="e.g. First round"
                      className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </td>
                  <td className="py-1.5">
                    <button
                      type="button"
                      onClick={() => onChange(rows.filter((_, ri) => ri !== i))}
                      className="rounded-md p-1 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button
        type="button"
        onClick={() => onChange([...rows, { name: "", role: "", interviewStage: "" }])}
        className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-brand-400 hover:text-brand-600 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />Add stakeholder
      </button>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface Props {
  jobId: string;
}

type SaveState = "idle" | "saving" | "saved";

export function JobIntakeForm({ jobId }: Props) {
  const [intake,    setIntake]    = useState<IntakeData>(DEFAULT_INTAKE);
  const [loading,   setLoading]   = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing intake data
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("jobs")
      .select("intake")
      .eq("id", jobId)
      .single()
      .then(({ data }) => {
        if (data?.intake && Object.keys(data.intake).length > 0) {
          setIntake({ ...DEFAULT_INTAKE, ...data.intake as Partial<IntakeData> });
        }
        setLoading(false);
      });
  }, [jobId]);

  // Debounced auto-save
  const save = useCallback(async (data: IntakeData) => {
    setSaveState("saving");
    const supabase = createClient();
    const { error } = await supabase
      .from("jobs")
      .update({ intake: data })
      .eq("id", jobId);
    if (error) {
      toast.error("Failed to save intake");
      setSaveState("idle");
    } else {
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    }
  }, [jobId]);

  function handleChange(patch: Partial<IntakeData>) {
    const next = { ...intake, ...patch };
    setIntake(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(next), 800);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Save indicator */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Job Intake</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Capture everything you need to source and screen for this role.
          </p>
        </div>
        <div className={cn(
          "flex items-center gap-1.5 text-xs transition-opacity",
          saveState === "idle" ? "opacity-0" : "opacity-100"
        )}>
          {saveState === "saving" && <><Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /><span className="text-muted-foreground">Saving…</span></>}
          {saveState === "saved"  && <><Check className="h-3 w-3 text-emerald-500" /><span className="text-emerald-600">Saved</span></>}
        </div>
      </div>

      {/* ── Hiring manager ─────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 pb-1 border-b border-border">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hiring Manager</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <input
              value={intake.hiringManagerName}
              onChange={(e) => handleChange({ hiringManagerName: e.target.value })}
              placeholder="Jane Smith"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <input
              type="email"
              value={intake.hiringManagerEmail}
              onChange={(e) => handleChange({ hiringManagerEmail: e.target.value })}
              placeholder="jane@company.com"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Open Headcount</label>
            <input
              type="number"
              min={1}
              value={intake.openReqCount}
              onChange={(e) => handleChange({ openReqCount: parseInt(e.target.value) || 1 })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="space-y-1 flex items-center gap-3 pt-5">
            <input
              type="checkbox"
              id="compApproved"
              checked={intake.compApproved}
              onChange={(e) => handleChange({ compApproved: e.target.checked })}
              className="h-4 w-4 rounded border-border text-brand-600 focus:ring-brand-500"
            />
            <label htmlFor="compApproved" className="text-sm text-foreground cursor-pointer">
              Compensation approved
            </label>
          </div>
        </div>
      </section>

      {/* ── Timeline ───────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 pb-1 border-b border-border">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Timeline</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Target Start Date</label>
            <input
              type="date"
              value={intake.targetStartDate ?? ""}
              onChange={(e) => handleChange({ targetStartDate: e.target.value || null })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Latest Fill Date</label>
            <input
              type="date"
              value={intake.latestFillDate ?? ""}
              onChange={(e) => handleChange({ latestFillDate: e.target.value || null })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
      </section>

      {/* ── Requirements ───────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 pb-1 border-b border-border">
          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Requirements</h3>
        </div>
        <SkillChips
          label="Must-Have Skills"
          chips={intake.mustHaveSkills}
          onChange={(chips) => handleChange({ mustHaveSkills: chips })}
        />
        <SkillChips
          label="Nice-to-Have Skills"
          chips={intake.niceToHaveSkills}
          onChange={(chips) => handleChange({ niceToHaveSkills: chips })}
        />
      </section>

      {/* ── Sourcing ───────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 pb-1 border-b border-border">
          <Target className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sourcing Strategy</h3>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Target Companies</label>
          <textarea
            value={intake.targetCompanies}
            onChange={(e) => handleChange({ targetCompanies: e.target.value })}
            rows={2}
            placeholder="Stripe, Square, Shopify, Adyen…"
            className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Sourcing Notes</label>
          <textarea
            value={intake.sourcingNotes}
            onChange={(e) => handleChange({ sourcingNotes: e.target.value })}
            rows={3}
            placeholder="Any specific notes, exclusions, or sourcing strategy for this req…"
            className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </section>

      {/* ── Interview panel ─────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 pb-1 border-b border-border">
          <Briefcase className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Interview Panel</h3>
        </div>
        <StakeholderTable
          rows={intake.stakeholders}
          onChange={(rows) => handleChange({ stakeholders: rows })}
        />
      </section>
    </div>
  );
}
