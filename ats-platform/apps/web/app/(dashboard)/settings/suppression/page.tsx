"use client";

/**
 * Settings → Suppression List
 *
 * US-473 / US-482: Admin view of addresses that are never emailed. Shows
 * unsubscribes, hard bounces, spam complaints, and manual entries. Also
 * shows the last 100 bounce events for triage.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ShieldOff, Trash2, Plus, AlertCircle, Mail, Ban, Loader2,
} from "lucide-react";
import { toast } from "sonner";

interface Suppression {
  id:         string;
  email:      string;
  reason:     string;
  source:     string | null;
  note:       string | null;
  created_at: string;
}
interface Bounce {
  id:              string;
  recipient_email: string;
  bounce_type:     string;
  diagnostic_code: string | null;
  smtp_status:     string | null;
  reported_at:     string;
}

const REASON_LABEL: Record<string, string> = {
  unsubscribe:             "Unsubscribe",
  list_unsubscribe_post:   "One-click unsubscribe",
  hard_bounce:             "Hard bounce",
  complaint:               "Spam complaint",
  manual:                  "Manual",
};

export default function SuppressionPage() {
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  const [bounces,      setBounces]      = useState<Bounce[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [addEmail,     setAddEmail]     = useState("");
  const [addNote,      setAddNote]      = useState("");
  const [adding,       setAdding]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/settings/suppression");
      const data = await res.json();
      setSuppressions(data.suppressions ?? []);
      setBounces(data.bounces ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function addOne() {
    if (!addEmail) return;
    setAdding(true);
    try {
      const res = await fetch("/api/settings/suppression", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: addEmail, note: addNote || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed");
      }
      setAddEmail(""); setAddNote("");
      toast.success("Added to suppression list");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally { setAdding(false); }
  }

  async function removeOne(id: string) {
    if (!confirm("Remove this address from the suppression list? They will be reachable again.")) return;
    try {
      const res = await fetch(`/api/settings/suppression?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed");
      }
      toast.success("Removed");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-8">
      <header className="flex items-center gap-3">
        <ShieldOff className="h-6 w-6 text-indigo-600" />
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Suppression List</h1>
          <p className="text-sm text-gray-500">
            Addresses on this list are never sent outbound email, regardless of sequence state.
          </p>
        </div>
      </header>

      {/* Add form */}
      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
          <Plus className="h-4 w-4" /> Block an address manually
        </h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            placeholder="email@example.com"
            value={addEmail}
            onChange={(e) => setAddEmail(e.target.value)}
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Note (optional)"
            value={addNote}
            onChange={(e) => setAddNote(e.target.value)}
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
          <button
            onClick={() => void addOne()}
            disabled={adding || !addEmail}
            className="inline-flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm rounded-md px-4 py-2"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
            Block
          </button>
        </div>
      </section>

      {/* Suppression list */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <header className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-900">
            Suppressions <span className="text-gray-400">({suppressions.length})</span>
          </h2>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        </header>
        {suppressions.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            <Mail className="mx-auto h-6 w-6 text-gray-300 mb-2" />
            No suppressions yet. Unsubscribes and hard bounces will appear here.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-5 py-2 font-medium">Email</th>
                <th className="px-5 py-2 font-medium">Reason</th>
                <th className="px-5 py-2 font-medium">Added</th>
                <th className="px-5 py-2 font-medium">Note</th>
                <th className="px-5 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {suppressions.map((s) => (
                <tr key={s.id}>
                  <td className="px-5 py-2 font-mono text-xs">{s.email}</td>
                  <td className="px-5 py-2">{REASON_LABEL[s.reason] ?? s.reason}</td>
                  <td className="px-5 py-2 text-gray-500">
                    {new Date(s.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-2 text-gray-500 truncate max-w-xs">{s.note ?? ""}</td>
                  <td className="px-5 py-2 text-right">
                    <button
                      onClick={() => void removeOne(s.id)}
                      title="Remove"
                      className="inline-flex items-center text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Recent bounces */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <header className="px-5 py-3 border-b border-gray-200 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-medium text-gray-900">
            Recent bounces <span className="text-gray-400">({bounces.length})</span>
          </h2>
        </header>
        {bounces.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            No bounces in the last 100 messages.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-5 py-2 font-medium">Recipient</th>
                <th className="px-5 py-2 font-medium">Type</th>
                <th className="px-5 py-2 font-medium">SMTP</th>
                <th className="px-5 py-2 font-medium">Detail</th>
                <th className="px-5 py-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bounces.map((b) => (
                <tr key={b.id}>
                  <td className="px-5 py-2 font-mono text-xs">{b.recipient_email}</td>
                  <td className="px-5 py-2">
                    <span className={
                      b.bounce_type === "hard" ? "text-red-600" :
                      b.bounce_type === "soft" ? "text-amber-600" :
                      b.bounce_type === "complaint" ? "text-red-700" : "text-gray-600"
                    }>{b.bounce_type}</span>
                  </td>
                  <td className="px-5 py-2 font-mono text-xs text-gray-500">{b.smtp_status ?? ""}</td>
                  <td className="px-5 py-2 text-gray-500 truncate max-w-md">{b.diagnostic_code ?? ""}</td>
                  <td className="px-5 py-2 text-gray-500">
                    {new Date(b.reported_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
