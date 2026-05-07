"use client";

/**
 * Settings → Agency Profile
 *
 * US-482: Capture the CAN-SPAM physical-address + legal-name fields used in
 * outbound email footers. Owners/admins only.
 */

import { useEffect, useState, useCallback } from "react";
import { Building2, MapPin, Mail, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface AgencyProfile {
  name:           string;
  legalName:      string;
  mailingAddress: string;
  supportEmail:   string;
  ready:          boolean;
}

export default function AgencyProfilePage() {
  const [profile, setProfile] = useState<AgencyProfile | null>(null);
  const [legalName,      setLegalName]      = useState("");
  const [mailingAddress, setMailingAddress] = useState("");
  const [supportEmail,   setSupportEmail]   = useState("");
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/settings/agency-profile");
      const data = (await res.json()) as AgencyProfile;
      setProfile(data);
      setLegalName(data.legalName);
      setMailingAddress(data.mailingAddress);
      setSupportEmail(data.supportEmail);
    } catch {
      toast.error("Failed to load agency profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/agency-profile", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ legalName, mailingAddress, supportEmail }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Save failed");
      }
      toast.success("Agency profile updated");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500">
        <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      <header className="flex items-center gap-3 mb-4">
        <Building2 className="h-6 w-6 text-indigo-600" />
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Agency Profile</h1>
          <p className="text-sm text-gray-500">
            Required by CAN-SPAM and shown in the footer of every outbound email.
          </p>
        </div>
      </header>

      {!profile?.ready && (
        <div className="flex items-start gap-2 border border-amber-300 bg-amber-50 text-amber-900 rounded-lg p-3 text-sm">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            You can't send outreach emails until a legal name and a physical
            mailing address are set. These appear at the bottom of every email
            your recruiters send.
          </span>
        </div>
      )}

      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Legal name</label>
          <input
            type="text"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            placeholder={profile?.name ?? ""}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">
            e.g. "Ikhaya Talent Partners, LLC" — the registered business name.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <MapPin className="inline h-3 w-3 mr-1" />
            Mailing address
          </label>
          <textarea
            rows={4}
            value={mailingAddress}
            onChange={(e) => setMailingAddress(e.target.value)}
            placeholder={"500 Market St, Suite 300\nSan Francisco, CA 94105\nUnited States"}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono"
          />
          <p className="mt-1 text-xs text-gray-500">
            CAN-SPAM requires a valid physical address. A registered agent or
            PO box both count.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <Mail className="inline h-3 w-3 mr-1" />
            Support email (optional)
          </label>
          <input
            type="email"
            value={supportEmail}
            onChange={(e) => setSupportEmail(e.target.value)}
            placeholder="hello@ikhaya.io"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">
            Used for mailto: unsubscribe fallback. Leave blank to use the
            tokenized alias.
          </p>
        </div>
      </section>

      <div className="flex items-center justify-end gap-2">
        {profile?.ready && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
            <CheckCircle2 className="h-3 w-3" /> Ready to send
          </span>
        )}
        <button
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-md px-4 py-2"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save
        </button>
      </div>
    </div>
  );
}
