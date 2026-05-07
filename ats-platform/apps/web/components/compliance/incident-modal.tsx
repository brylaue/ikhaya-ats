"use client";

/**
 * ComplianceIncidentModal
 * Used to report and manage data breach / compliance incidents.
 * Surfaces the GDPR 72-hour authority notification deadline prominently.
 */

import { useState } from "react";
import {
  AlertTriangle,
  Shield,
  Clock,
  CheckCircle,
  Phone,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  useComplianceIncidents,
  type ComplianceIncident,
  type IncidentType,
  type IncidentSeverity,
} from "@/lib/supabase/compliance-hooks";

// ─── Report new incident ──────────────────────────────────────────────────────

interface ReportProps {
  open: boolean;
  onClose: () => void;
}

export function ReportIncidentModal({ open, onClose }: ReportProps) {
  const { createIncident } = useComplianceIncidents();
  const [type, setType]           = useState<IncidentType>("data_breach");
  const [severity, setSeverity]   = useState<IncidentSeverity>("medium");
  const [title, setTitle]         = useState("");
  const [description, setDesc]    = useState("");
  const [systems, setSystems]     = useState("");
  const [records, setRecords]     = useState("");
  const [saving, setSaving]       = useState(false);
  const [done, setDone]           = useState(false);

  const reset = () => {
    setType("data_breach"); setSeverity("medium"); setTitle(""); setDesc("");
    setSystems(""); setRecords(""); setSaving(false); setDone(false);
  };

  const handleSubmit = async () => {
    if (!title) return;
    setSaving(true);
    await createIncident({
      incident_type: type,
      severity,
      title,
      description: description || undefined,
      affected_systems: systems ? systems.split(",").map(s => s.trim()) : undefined,
      affected_records_estimate: records ? parseInt(records, 10) : undefined,
    });
    setSaving(false);
    setDone(true);
  };

  return (
    <Dialog open={open} onOpenChange={() => { onClose(); reset(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Report Compliance Incident
          </DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="py-8 text-center">
            <Shield className="h-10 w-10 text-indigo-500 mx-auto mb-3" />
            <p className="font-semibold text-slate-800">Incident logged</p>
            {type === "data_breach" && (
              <p className="text-sm text-red-600 mt-2 font-medium">
                ⚠️ GDPR 72-hour clock has started. Authority notification deadline is visible in the Compliance Dashboard.
              </p>
            )}
            <Button className="mt-4" onClick={() => { onClose(); reset(); }}>
              View Incident
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              {type === "data_breach" && (
                <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800 flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>
                    <strong>GDPR Art. 33:</strong> Data breaches must be reported to the supervisory
                    authority within <strong>72 hours</strong> of discovery unless unlikely to result
                    in risk to individuals.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Incident Type</Label>
                  <Select value={type} onValueChange={v => setType(v as IncidentType)}>
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="data_breach">Data Breach</SelectItem>
                      <SelectItem value="near_miss">Near Miss</SelectItem>
                      <SelectItem value="subject_complaint">Subject Complaint</SelectItem>
                      <SelectItem value="regulatory_audit">Regulatory Audit</SelectItem>
                      <SelectItem value="policy_violation">Policy Violation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Severity</Label>
                  <Select value={severity} onValueChange={v => setSeverity(v as IncidentSeverity)}>
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Title <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. 'Recruiter forwarded candidate CSV to wrong client'"
                  className="text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Description</Label>
                <Textarea
                  value={description}
                  onChange={e => setDesc(e.target.value)}
                  placeholder="What happened, when was it discovered, who is affected?"
                  rows={3}
                  className="text-sm resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Affected Systems</Label>
                  <Input
                    value={systems}
                    onChange={e => setSystems(e.target.value)}
                    placeholder="candidate_db, email_sync"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Est. Records Affected</Label>
                  <Input
                    type="number"
                    value={records}
                    onChange={e => setRecords(e.target.value)}
                    placeholder="0"
                    className="text-sm"
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => { onClose(); reset(); }}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!title || saving}
                onClick={handleSubmit}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {saving ? "Logging…" : "Log Incident"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Incident detail card (used in the compliance dashboard list) ─────────────

interface IncidentCardProps {
  incident: ComplianceIncident;
  onUpdate: (id: string, updates: Partial<ComplianceIncident>) => void;
  onMarkContained: (id: string, rootCause: string, steps: string) => void;
  onMarkNotified: (id: string, reference: string) => void;
}

const severityColors: Record<IncidentSeverity, string> = {
  low:      "bg-slate-100 text-slate-700",
  medium:   "bg-amber-100 text-amber-800",
  high:     "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

export function IncidentCard({
  incident,
  onMarkContained,
  onMarkNotified,
}: IncidentCardProps) {
  const [expanded, setExpanded]   = useState(false);
  const [rootCause, setRootCause] = useState(incident.root_cause ?? "");
  const [steps, setSteps]         = useState(incident.remediation_steps ?? "");
  const [reference, setReference] = useState(incident.authority_reference ?? "");

  const isBreachOpen = incident.incident_type === "data_breach" &&
    !["resolved","closed"].includes(incident.status);

  return (
    <div className={`border rounded-lg overflow-hidden ${
      incident.is_past_deadline ? "border-red-400" : "border-slate-200"
    }`}>
      <div
        className="flex items-start gap-3 p-3 cursor-pointer hover:bg-slate-50"
        onClick={() => setExpanded(e => !e)}
      >
        <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
          incident.severity === "critical" ? "text-red-600" :
          incident.severity === "high"     ? "text-orange-500" :
          incident.severity === "medium"   ? "text-amber-500" :
          "text-slate-400"
        }`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-800">{incident.title}</span>
            <Badge className={`text-[10px] px-1.5 py-0 ${severityColors[incident.severity]}`}>
              {incident.severity}
            </Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {incident.status.replace("_", " ")}
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {incident.incident_type.replace("_", " ")} · Discovered{" "}
            {new Date(incident.discovered_at).toLocaleDateString()}
          </p>
          {isBreachOpen && (
            <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${
              incident.is_past_deadline ? "text-red-700" : "text-amber-700"
            }`}>
              <Clock className="h-3 w-3" />
              {incident.is_past_deadline ? (
                <>Authority deadline PASSED — notified? {incident.notified_authority_at ? "Yes" : "NO"}</>
              ) : (
                <>{incident.hours_to_deadline}h until 72hr authority deadline</>
              )}
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t p-3 space-y-3 bg-slate-50">
          {incident.description && (
            <p className="text-xs text-slate-700">{incident.description}</p>
          )}

          {/* Containment */}
          {!["contained","resolved","closed","reported_to_authority"].includes(incident.status) && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700">Mark as Contained</p>
              <Textarea
                value={rootCause}
                onChange={e => setRootCause(e.target.value)}
                placeholder="Root cause…"
                rows={2}
                className="text-xs resize-none"
              />
              <Textarea
                value={steps}
                onChange={e => setSteps(e.target.value)}
                placeholder="Remediation steps taken…"
                rows={2}
                className="text-xs resize-none"
              />
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => onMarkContained(incident.id, rootCause, steps)}
                disabled={!rootCause || !steps}
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                Mark Contained
              </Button>
            </div>
          )}

          {/* Authority notification */}
          {isBreachOpen && !incident.notified_authority_at && (
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs font-semibold text-red-700 flex items-center gap-1">
                <Phone className="h-3 w-3" />
                Authority Notification (GDPR Art. 33)
              </p>
              <Input
                value={reference}
                onChange={e => setReference(e.target.value)}
                placeholder="ICO / DPA reference number"
                className="text-xs"
              />
              <Button
                size="sm"
                className="text-xs bg-red-600 hover:bg-red-700 text-white"
                onClick={() => onMarkNotified(incident.id, reference)}
                disabled={!reference}
              >
                Mark Authority Notified
              </Button>
            </div>
          )}

          {incident.notified_authority_at && (
            <div className="flex items-center gap-1 text-xs text-green-700 border-t pt-2">
              <CheckCircle className="h-3 w-3" />
              Authority notified {new Date(incident.notified_authority_at).toLocaleString()}
              {incident.authority_reference && ` · Ref: ${incident.authority_reference}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
