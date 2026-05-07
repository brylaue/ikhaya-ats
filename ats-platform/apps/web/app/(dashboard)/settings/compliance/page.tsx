/**
 * /settings/compliance
 * Full compliance & data privacy administration page.
 * Tabs: Overview · DSAR Queue · Incidents · Retention · Article 30
 */

"use client";

import { useState } from "react";
import {
  Shield,
  AlertTriangle,
  FileSearch,
  Trash2,
  Clock,
  Database,
  BookOpen,
  Plus,
  RefreshCw,
  ChevronRight,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useComplianceSummary,
  usePrivacyRequests,
  useComplianceIncidents,
  useRetentionPolicy,
  useRetentionFlags,
  useDataProcessingRecords,
  type PrivacyRequest,
  type ComplianceIncident,
  type DataRetentionPolicy,
} from "@/lib/supabase/compliance-hooks";
import {
  PrivacyRequestIntakeModal,
  PrivacyRequestReviewModal,
} from "@/components/compliance/privacy-request-modal";
import {
  ReportIncidentModal,
  IncidentCard,
} from "@/components/compliance/incident-modal";

// ─────────────────────────────────────────────────────────────────────────────
// OVERVIEW TAB — health scorecard
// ─────────────────────────────────────────────────────────────────────────────

function OverviewTab() {
  const { summary, loading } = useComplianceSummary();

  if (loading) return <div className="p-8 text-center text-sm text-slate-400">Loading…</div>;
  if (!summary) return null;

  const signals = [
    {
      label: "Open DSARs",
      value: summary.open_dsars,
      sub: summary.overdue_dsars > 0 ? `${summary.overdue_dsars} overdue` : "All within SLA",
      ok: summary.overdue_dsars === 0,
      icon: <FileSearch className="h-5 w-5" />,
      href: "#dsar",
    },
    {
      label: "Active Breaches",
      value: summary.open_breaches,
      sub: summary.past_deadline_breaches > 0
        ? `${summary.past_deadline_breaches} past 72hr deadline`
        : summary.open_breaches === 0 ? "No incidents" : "Within 72h window",
      ok: summary.open_breaches === 0 && summary.past_deadline_breaches === 0,
      icon: <AlertTriangle className="h-5 w-5" />,
      href: "#incidents",
    },
    {
      label: "Retention Flags",
      value: summary.retention_flags,
      sub: summary.enforcement_enabled ? "Enforcement active" : "Enforcement off",
      ok: summary.retention_flags === 0,
      icon: <Trash2 className="h-5 w-5" />,
      href: "#retention",
    },
    {
      label: "RoPA Records",
      value: summary.processing_records_needing_review,
      sub: summary.processing_records_needing_review === 0 ? "All reviewed" : "Need annual review",
      ok: summary.processing_records_needing_review === 0,
      icon: <BookOpen className="h-5 w-5" />,
      href: "#article30",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Score cards */}
      <div className="grid grid-cols-4 gap-4">
        {signals.map(s => (
          <a key={s.label} href={s.href} className="block">
            <div className={`rounded-lg border p-4 hover:shadow-sm transition-shadow ${
              !s.ok ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className={!s.ok ? "text-red-500" : "text-slate-400"}>{s.icon}</span>
                {s.ok ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )}
              </div>
              <div className={`text-3xl font-bold ${!s.ok ? "text-red-700" : "text-slate-800"}`}>
                {s.value}
              </div>
              <div className="text-xs font-semibold text-slate-700 mt-1">{s.label}</div>
              <div className={`text-[11px] mt-0.5 ${!s.ok ? "text-red-600" : "text-slate-400"}`}>
                {s.sub}
              </div>
            </div>
          </a>
        ))}
      </div>

      {/* Regulation reference */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Compliance Reference</h3>
        <div className="grid grid-cols-3 gap-4 text-xs">
          {[
            {
              title: "GDPR (EU) / UK GDPR",
              items: [
                "30 days to respond to DSARs",
                "72 hours to notify authority of breach",
                "Right to erasure applies to all data",
                "Legitimate interest requires LIA",
                "Article 30: maintain processing records",
              ],
            },
            {
              title: "CCPA (California)",
              items: [
                "45 days to respond to DSARs",
                "Right to know: 12 months of data",
                "Right to delete with some exceptions",
                "Right to opt-out of data sale",
                "Non-discrimination clause",
              ],
            },
            {
              title: "Best Practices",
              items: [
                "Verify identity before erasure",
                "Conduct annual RoPA review",
                "Run dry-run enforcement before enabling",
                "Document all consent withdrawals",
                "Keep breach response log regardless of severity",
              ],
            },
          ].map(col => (
            <div key={col.title}>
              <p className="font-semibold text-slate-700 mb-1.5">{col.title}</p>
              <ul className="space-y-1">
                {col.items.map(i => (
                  <li key={i} className="flex items-start gap-1.5 text-slate-600">
                    <span className="text-indigo-400 mt-0.5 flex-shrink-0">·</span>
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DSAR QUEUE TAB
// ─────────────────────────────────────────────────────────────────────────────

function DsarQueueTab() {
  const { requests, loading, overdueCount } = usePrivacyRequests();
  const [intakeOpen, setIntakeOpen]       = useState(false);
  const [reviewing, setReviewing]         = useState<PrivacyRequest | null>(null);

  const statusOrder = ["pending","verifying","in_review","fulfilled","denied","cancelled"];
  const sorted = [...requests].sort((a, b) =>
    statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status) ||
    new Date(a.due_at).getTime() - new Date(b.due_at).getTime()
  );

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Data Subject Requests</h3>
          <p className="text-xs text-slate-500">
            {requests.length} total{overdueCount > 0 && ` · ${overdueCount} overdue`}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setIntakeOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Log Request
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-sm text-slate-400">Loading…</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed rounded-lg">
          <FileSearch className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-500">No privacy requests</p>
          <p className="text-xs text-slate-400 mt-1">Log one when a candidate contacts you about their data.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(r => {
            const isOverdue = r.is_overdue;
            const isActive  = !["fulfilled","denied","cancelled"].includes(r.status);
            return (
              <div
                key={r.id}
                onClick={() => setReviewing(r)}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:shadow-sm transition-shadow ${
                  isOverdue ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
                }`}
              >
                <FileSearch className={`h-4 w-4 flex-shrink-0 ${isOverdue ? "text-red-500" : "text-slate-400"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-800 truncate">
                      {r.requester_name ?? r.requester_email}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {r.request_type.replace("_", " ")}
                    </Badge>
                    {!r.identity_verified && isActive && (
                      <span className="text-[10px] text-amber-600 font-medium">identity unverified</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {r.requester_email} · Received {new Date(r.received_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isActive && (
                    <div className={`flex items-center gap-1 text-xs ${
                      isOverdue ? "text-red-700 font-semibold" : r.days_remaining! <= 7 ? "text-amber-700" : "text-slate-500"
                    }`}>
                      <Clock className="h-3 w-3" />
                      {isOverdue ? "Overdue" : `${r.days_remaining}d`}
                    </div>
                  )}
                  <Badge className={`text-[10px] ${
                    r.status === "fulfilled" ? "bg-green-100 text-green-800" :
                    r.status === "denied"    ? "bg-red-100 text-red-800" :
                    r.status === "pending"   ? "bg-amber-100 text-amber-800" :
                    "bg-slate-100 text-slate-700"
                  }`}>
                    {r.status.replace("_", " ")}
                  </Badge>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PrivacyRequestIntakeModal open={intakeOpen} onClose={() => setIntakeOpen(false)} />
      {reviewing && (
        <PrivacyRequestReviewModal
          request={reviewing}
          open={!!reviewing}
          onClose={() => setReviewing(null)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INCIDENTS TAB
// ─────────────────────────────────────────────────────────────────────────────

function IncidentsTab() {
  const { incidents, loading, markContained, markAuthorityNotified, updateIncident } =
    useComplianceIncidents();
  const [reportOpen, setReportOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Compliance Incidents</h3>
          <p className="text-xs text-slate-500">Breaches, near-misses, complaints, audits</p>
        </div>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => setReportOpen(true)}
        >
          <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
          Report Incident
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-sm text-slate-400">Loading…</div>
      ) : incidents.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed rounded-lg">
          <Shield className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-500">No incidents recorded</p>
        </div>
      ) : (
        <div className="space-y-2">
          {incidents.map(inc => (
            <IncidentCard
              key={inc.id}
              incident={inc}
              onUpdate={updateIncident}
              onMarkContained={markContained}
              onMarkNotified={markAuthorityNotified}
            />
          ))}
        </div>
      )}

      <ReportIncidentModal open={reportOpen} onClose={() => setReportOpen(false)} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RETENTION TAB
// ─────────────────────────────────────────────────────────────────────────────

function RetentionTab() {
  const { policy, loading, saving, updatePolicy, runEnforcement } = useRetentionPolicy();
  const { flags, urgentCount, dismissFlag } = useRetentionFlags();
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    setRunning(true);
    await runEnforcement();
    setRunning(false);
  };

  if (loading || !policy) return <div className="text-center py-8 text-sm text-slate-400">Loading…</div>;

  return (
    <div className="space-y-6">
      {/* Settings */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Retention Policy</h3>
            <p className="text-xs text-slate-500 mt-0.5">Configure how long each data category is retained</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={policy.dry_run_mode}
                onCheckedChange={v => updatePolicy({ dry_run_mode: v })}
                id="dry-run"
              />
              <Label htmlFor="dry-run" className="text-xs">Dry run</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={policy.enforcement_enabled}
                onCheckedChange={v => updatePolicy({ enforcement_enabled: v })}
                id="enforcement"
              />
              <Label htmlFor="enforcement" className="text-xs text-slate-700 font-medium">
                Enforcement {policy.enforcement_enabled ? "ON" : "OFF"}
              </Label>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {([
            { key: "candidate_inactive_months", label: "Candidate profiles (inactive)", hint: "GDPR: 36mo recommended" },
            { key: "email_body_months",          label: "Email bodies",                 hint: "PII-heavy; 12mo max recommended" },
            { key: "activity_log_months",        label: "Activity logs",                hint: "7yr for legal/audit" },
            { key: "placement_months",           label: "Placement records",            hint: "7yr (financial obligation)" },
            { key: "audit_log_months",           label: "Audit logs",                   hint: "7yr recommended" },
            { key: "resume_file_months",         label: "Resume files",                 hint: "36mo recommended" },
          ] as const).map(field => (
            <div key={field.key} className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">{field.label}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={(policy as unknown as Record<string, number>)[field.key]}
                  onChange={e => updatePolicy({ [field.key]: parseInt(e.target.value, 10) })}
                  className="text-sm w-20"
                  min={1}
                />
                <span className="text-xs text-slate-500">months</span>
              </div>
              <p className="text-[10px] text-slate-400">{field.hint}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Warn before deletion</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={policy.notify_before_deletion_days}
                onChange={e => updatePolicy({ notify_before_deletion_days: parseInt(e.target.value, 10) })}
                className="text-sm w-20"
                min={7}
              />
              <span className="text-xs text-slate-500">days notice to recruiter</span>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Primary Regulation</Label>
            <Select
              value={policy.primary_regulation}
              onValueChange={v => updatePolicy({ primary_regulation: v as DataRetentionPolicy["primary_regulation"] })}
            >
              <SelectTrigger className="text-sm w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gdpr">GDPR (EU)</SelectItem>
                <SelectItem value="uk_gdpr">UK GDPR</SelectItem>
                <SelectItem value="ccpa">CCPA</SelectItem>
                <SelectItem value="pipeda">PIPEDA (Canada)</SelectItem>
                <SelectItem value="none">None specified</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t pt-4">
          <Button
            size="sm"
            variant="outline"
            onClick={handleRun}
            disabled={running || saving}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${running ? "animate-spin" : ""}`} />
            {running ? "Running…" : policy.dry_run_mode ? "Run Dry Run" : "Run Enforcement Now"}
          </Button>
          {policy.last_enforcement_run && (
            <span className="text-xs text-slate-400">
              Last run: {new Date(policy.last_enforcement_run).toLocaleString()}
              {policy.last_enforcement_summary && (
                ` · ${policy.last_enforcement_summary.candidates_flagged} flagged`
              )}
            </span>
          )}
        </div>
      </div>

      {/* Retention flags */}
      {flags.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {flags.length} Candidate{flags.length > 1 ? "s" : ""} Flagged for Deletion
              {urgentCount > 0 && (
                <span className="text-red-700 ml-1">({urgentCount} within 7 days)</span>
              )}
            </p>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {flags.map(f => (
              <div
                key={f.id}
                className="flex items-center gap-3 bg-white rounded border border-amber-200 p-2.5"
              >
                <Trash2 className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-800">
                    {(f as unknown as { candidates?: { first_name: string; last_name: string; email: string } }).candidates
                      ? `${(f as unknown as { candidates: { first_name: string; last_name: string } }).candidates.first_name} ${(f as unknown as { candidates: { last_name: string } }).candidates.last_name}`
                      : f.candidate_id}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {f.reason.replace(/_/g, " ")} · Purge after {new Date(f.purge_after).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-[10px] h-6 px-2 text-slate-600"
                  onClick={() => dismissFlag(f.id)}
                >
                  Keep
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ARTICLE 30 TAB — Record of Processing Activities
// ─────────────────────────────────────────────────────────────────────────────

function Article30Tab() {
  const { records, loading, updateRecord, needsReviewCount } = useDataProcessingRecords();

  const legalBasisColors: Record<string, string> = {
    consent:               "bg-green-100 text-green-800",
    legitimate_interest:   "bg-blue-100 text-blue-800",
    contract:              "bg-purple-100 text-purple-800",
    legal_obligation:      "bg-amber-100 text-amber-800",
    vital_interests:       "bg-red-100 text-red-800",
    public_task:           "bg-slate-100 text-slate-700",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Article 30 Register</h3>
          <p className="text-xs text-slate-500">
            Record of Processing Activities (RoPA) — required under GDPR Art. 30
            {needsReviewCount > 0 && (
              <span className="text-amber-600 ml-1">· {needsReviewCount} need annual review</span>
            )}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-sm text-slate-400">Loading…</div>
      ) : (
        <div className="space-y-3">
          {records.map(r => {
            const needsReview = !r.last_reviewed_at ||
              new Date(r.last_reviewed_at) < new Date(Date.now() - 365 * 86400000);

            return (
              <div
                key={r.id}
                className={`rounded-lg border p-4 bg-white ${
                  needsReview ? "border-amber-300" : "border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-800">{r.activity_name}</p>
                      <Badge className={`text-[10px] ${legalBasisColors[r.legal_basis] ?? "bg-slate-100 text-slate-700"}`}>
                        {r.legal_basis.replace("_", " ")}
                      </Badge>
                      {!r.is_active && (
                        <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
                      )}
                      {needsReview && (
                        <Badge className="text-[10px] bg-amber-100 text-amber-800">Needs review</Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mt-1">{r.purpose}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                      <span><strong>Data:</strong> {r.data_categories.join(", ")}</span>
                      <span><strong>Subjects:</strong> {r.data_subjects.join(", ")}</span>
                      <span><strong>Retention:</strong> {r.retention_period}</span>
                      {r.third_country_transfers && r.third_country_transfers.length > 0 && (
                        <span className="text-amber-700">
                          <strong>Cross-border:</strong> {r.third_country_transfers.join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-[10px] text-slate-400">
                      {r.last_reviewed_at
                        ? `Reviewed ${new Date(r.last_reviewed_at).toLocaleDateString()}`
                        : "Never reviewed"}
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-[10px] h-6 px-2 mt-1 text-indigo-600"
                      onClick={() => updateRecord(r.id, { is_active: r.is_active })}
                    >
                      Mark Reviewed
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE SHELL
// ─────────────────────────────────────────────────────────────────────────────

export default function CompliancePage() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center">
          <Shield className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Compliance & Data Privacy</h1>
          <p className="text-sm text-slate-500">
            GDPR / CCPA controls — consent management, DSAR queue, breach response, data retention
          </p>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="h-9">
          <TabsTrigger value="overview"  className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="dsar"      className="text-xs">DSAR Queue</TabsTrigger>
          <TabsTrigger value="incidents" className="text-xs">Incidents</TabsTrigger>
          <TabsTrigger value="retention" className="text-xs">Retention</TabsTrigger>
          <TabsTrigger value="article30" className="text-xs">Article 30</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"  className="pt-4"><OverviewTab /></TabsContent>
        <TabsContent value="dsar"      className="pt-4"><DsarQueueTab /></TabsContent>
        <TabsContent value="incidents" className="pt-4"><IncidentsTab /></TabsContent>
        <TabsContent value="retention" className="pt-4"><RetentionTab /></TabsContent>
        <TabsContent value="article30" className="pt-4"><Article30Tab /></TabsContent>
      </Tabs>
    </div>
  );
}
