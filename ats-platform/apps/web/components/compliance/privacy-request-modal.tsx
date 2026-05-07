"use client";

/**
 * PrivacyRequestModal
 * Used in two contexts:
 *  1. Intake form — recruiter logs an inbound DSAR/erasure request
 *  2. Review panel — admin reviews, verifies identity, fulfils/denies
 */

import { useState } from "react";
import {
  FileSearch,
  Trash2,
  Download,
  Edit3,
  EyeOff,
  ThumbsDown,
  CheckCircle,
  AlertTriangle,
  Clock,
  User,
  Mail,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  usePrivacyRequests,
  useErasureCandidate,
  type PrivacyRequest,
  type PrivacyRequestType,
} from "@/lib/supabase/compliance-hooks";

// ─── Config ──────────────────────────────────────────────────────────────────

const REQUEST_TYPES: { type: PrivacyRequestType; label: string; icon: React.ReactNode; description: string }[] = [
  {
    type: "access",
    label: "Right of Access (SAR)",
    icon: <FileSearch className="h-4 w-4" />,
    description: "Candidate wants a copy of all data held on them",
  },
  {
    type: "erasure",
    label: "Right to Erasure",
    icon: <Trash2 className="h-4 w-4" />,
    description: "Candidate wants all their data permanently deleted",
  },
  {
    type: "portability",
    label: "Data Portability",
    icon: <Download className="h-4 w-4" />,
    description: "Machine-readable export of data to transfer elsewhere",
  },
  {
    type: "rectification",
    label: "Right to Rectification",
    icon: <Edit3 className="h-4 w-4" />,
    description: "Candidate wants to correct inaccurate information",
  },
  {
    type: "restriction",
    label: "Restriction of Processing",
    icon: <EyeOff className="h-4 w-4" />,
    description: "Pause processing while accuracy is contested",
  },
  {
    type: "objection",
    label: "Right to Object",
    icon: <ThumbsDown className="h-4 w-4" />,
    description: "Object to legitimate interest processing",
  },
];

function requestTypeLabel(type: PrivacyRequestType) {
  return REQUEST_TYPES.find(r => r.type === type)?.label ?? type;
}

function statusColor(status: PrivacyRequest["status"]) {
  const map: Record<string, string> = {
    pending:    "bg-amber-100 text-amber-800",
    verifying:  "bg-blue-100 text-blue-800",
    in_review:  "bg-indigo-100 text-indigo-800",
    fulfilled:  "bg-green-100 text-green-800",
    denied:     "bg-red-100 text-red-800",
    cancelled:  "bg-slate-100 text-slate-600",
  };
  return map[status] ?? "bg-slate-100 text-slate-600";
}

// ─── Intake form (create new request) ────────────────────────────────────────

interface IntakeProps {
  open: boolean;
  onClose: () => void;
  defaultCandidateId?: string;
}

export function PrivacyRequestIntakeModal({ open, onClose, defaultCandidateId }: IntakeProps) {
  const { createRequest } = usePrivacyRequests();
  const [type, setType]             = useState<PrivacyRequestType>("access");
  const [email, setEmail]           = useState("");
  const [name, setName]             = useState("");
  const [message, setMessage]       = useState("");
  const [saving, setSaving]         = useState(false);
  const [done, setDone]             = useState(false);

  const reset = () => {
    setType("access"); setEmail(""); setName(""); setMessage("");
    setDone(false); setSaving(false);
  };

  const handleSubmit = async () => {
    if (!email) return;
    setSaving(true);
    await createRequest({
      request_type: type,
      requester_email: email,
      requester_name: name || undefined,
      requester_message: message || undefined,
      candidate_id: defaultCandidateId,
    });
    setSaving(false);
    setDone(true);
  };

  return (
    <Dialog open={open} onOpenChange={() => { onClose(); reset(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSearch className="h-5 w-5 text-indigo-600" />
            Log Privacy Request
          </DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="py-8 text-center">
            <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-3" />
            <p className="font-semibold text-slate-800">Request logged</p>
            <p className="text-sm text-slate-500 mt-1">
              Due within 30 days. Find it in Settings → Compliance → DSAR Queue.
            </p>
            <Button className="mt-4" onClick={() => { onClose(); reset(); }}>Done</Button>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Request Type</Label>
                <div className="grid grid-cols-2 gap-2">
                  {REQUEST_TYPES.map(rt => (
                    <button
                      key={rt.type}
                      onClick={() => setType(rt.type)}
                      className={`flex items-start gap-2 p-2.5 rounded-lg border text-left transition-colors text-xs ${
                        type === rt.type
                          ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                          : "border-slate-200 hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <span className="mt-0.5 flex-shrink-0">{rt.icon}</span>
                      <div>
                        <div className="font-medium leading-tight">{rt.label}</div>
                        <div className="text-slate-500 mt-0.5 leading-tight">{rt.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Requester Email <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="candidate@example.com"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Name (optional)</Label>
                  <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Jane Smith"
                    className="text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Message / Details (optional)</Label>
                <Textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Any specifics about the request…"
                  rows={3}
                  className="text-sm resize-none"
                />
              </div>

              <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-[11px] text-blue-800">
                <strong>GDPR / CCPA reminder:</strong> Identity must be verified before fulfilling
                access or erasure requests. The system will log a 30-day SLA deadline.
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => { onClose(); reset(); }}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!email || saving}
                onClick={handleSubmit}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {saving ? "Logging…" : "Log Request"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Review panel (manage existing request) ───────────────────────────────────

interface ReviewProps {
  request: PrivacyRequest;
  open: boolean;
  onClose: () => void;
}

export function PrivacyRequestReviewModal({ request, open, onClose }: ReviewProps) {
  const { verifyIdentity, fulfillRequest, denyRequest, updateRequest } = usePrivacyRequests();
  const { eraseCandidate, erasing } = useErasureCandidate();

  const [notes, setNotes]           = useState(request.internal_notes ?? "");
  const [denyReason, setDenyReason] = useState("");
  const [tab, setTab]               = useState("details");
  const [saving, setSaving]         = useState(false);

  const dueDate    = new Date(request.due_at);
  const now        = new Date();
  const daysLeft   = Math.ceil((dueDate.getTime() - now.getTime()) / 86400000);
  const isOverdue  = daysLeft < 0 && !["fulfilled","denied","cancelled"].includes(request.status);
  const isActive   = !["fulfilled","denied","cancelled"].includes(request.status);

  const handleErase = async () => {
    if (!request.candidate_id) return;
    const result = await eraseCandidate(request.candidate_id, request.id);
    if (result) onClose();
  };

  const handleFulfil = async () => {
    setSaving(true);
    await fulfillRequest(request.id);
    setSaving(false);
    onClose();
  };

  const handleDeny = async () => {
    if (!denyReason) return;
    setSaving(true);
    await denyRequest(request.id, denyReason);
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <FileSearch className="h-5 w-5 text-indigo-600" />
            <div>
              <span className="text-base">{requestTypeLabel(request.request_type)}</span>
              <span className="text-xs text-slate-500 ml-2 font-normal">
                #{request.id.slice(0, 8)}
              </span>
            </div>
            <Badge className={`ml-auto text-[10px] ${statusColor(request.status)}`}>
              {request.status.replace("_", " ")}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* SLA banner */}
        {isActive && (
          <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs ${
            isOverdue
              ? "bg-red-50 border border-red-200 text-red-800"
              : daysLeft <= 7
              ? "bg-amber-50 border border-amber-200 text-amber-800"
              : "bg-green-50 border border-green-200 text-green-800"
          }`}>
            {isOverdue ? (
              <><AlertTriangle className="h-3.5 w-3.5" /> <strong>Overdue</strong> — due {dueDate.toLocaleDateString()}</>
            ) : (
              <><Clock className="h-3.5 w-3.5" /> Due {dueDate.toLocaleDateString()} · {daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining</>
            )}
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-8 text-xs">
            <TabsTrigger value="details" className="text-xs">Details</TabsTrigger>
            <TabsTrigger value="verify" className="text-xs">Identity Verification</TabsTrigger>
            <TabsTrigger value="fulfil" className="text-xs">Fulfil / Deny</TabsTrigger>
          </TabsList>

          {/* Details tab */}
          <TabsContent value="details" className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Requester</p>
                <div className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  <span>{request.requester_name ?? "—"}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  <span>{request.requester_email}</span>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Received</p>
                <p>{new Date(request.received_at).toLocaleDateString()}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  30-day SLA expires {dueDate.toLocaleDateString()}
                </p>
              </div>
            </div>
            {request.requester_message && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Message</p>
                <p className="text-sm text-slate-700 bg-slate-50 rounded p-2.5">{request.requester_message}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Internal Notes</p>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                onBlur={() => updateRequest(request.id, { internal_notes: notes })}
                rows={3}
                className="text-sm resize-none"
                placeholder="Add notes for your team…"
              />
            </div>
          </TabsContent>

          {/* Identity verification tab */}
          <TabsContent value="verify" className="space-y-3 pt-2">
            <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs border ${
              request.identity_verified
                ? "bg-green-50 border-green-200 text-green-800"
                : "bg-amber-50 border-amber-200 text-amber-800"
            }`}>
              {request.identity_verified ? (
                <><CheckCircle className="h-3.5 w-3.5" /> Identity verified
                  {request.identity_verified_at && ` on ${new Date(request.identity_verified_at).toLocaleDateString()}`}
                  {` via ${request.verification_method ?? "unknown"}`}
                </>
              ) : (
                <><AlertTriangle className="h-3.5 w-3.5" /> Identity not yet verified — required before fulfilling access or erasure requests</>
              )}
            </div>

            {!request.identity_verified && (
              <div className="space-y-2">
                <p className="text-xs text-slate-600">Mark identity as verified using one of these methods:</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["email_token","document","knowledge","manual"] as const).map(method => (
                    <Button
                      key={method}
                      variant="outline"
                      size="sm"
                      className="text-xs justify-start"
                      onClick={() => verifyIdentity(request.id, method)}
                    >
                      {method.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Fulfil / Deny tab */}
          <TabsContent value="fulfil" className="space-y-3 pt-2">
            {!isActive ? (
              <p className="text-sm text-slate-500 text-center py-6">
                This request has already been {request.status}.
              </p>
            ) : (
              <>
                {!request.identity_verified && (
                  <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800">
                    <AlertTriangle className="h-3 w-3 inline mr-1" />
                    Identity not verified. You can still fulfil the request, but this is not recommended
                    for access or erasure requests.
                  </div>
                )}

                {request.request_type === "erasure" && request.candidate_id && (
                  <div className="rounded-md bg-red-50 border border-red-200 p-3 space-y-2">
                    <p className="text-xs font-semibold text-red-800 flex items-center gap-1.5">
                      <Trash2 className="h-3.5 w-3.5" />
                      GDPR Erasure — Irreversible Action
                    </p>
                    <p className="text-xs text-red-700">
                      This will permanently delete the candidate record and all associated data:
                      activities, emails, applications, tasks, sequence enrollments.
                      This cannot be undone.
                    </p>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full"
                      onClick={handleErase}
                      disabled={erasing}
                    >
                      {erasing ? "Erasing…" : "Confirm Permanent Erasure"}
                    </Button>
                  </div>
                )}

                {request.request_type !== "erasure" && (
                  <Button
                    size="sm"
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                    onClick={handleFulfil}
                    disabled={saving}
                  >
                    <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                    Mark as Fulfilled
                  </Button>
                )}

                <div className="border-t pt-3 space-y-2">
                  <p className="text-xs font-semibold text-slate-700">Deny Request</p>
                  <Textarea
                    value={denyReason}
                    onChange={e => setDenyReason(e.target.value)}
                    placeholder="Reason for denial (e.g. 'Identity could not be verified', 'Request is manifestly unfounded')"
                    rows={2}
                    className="text-xs resize-none"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 border-red-300 hover:bg-red-50"
                    onClick={handleDeny}
                    disabled={!denyReason || saving}
                  >
                    Deny Request
                  </Button>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
