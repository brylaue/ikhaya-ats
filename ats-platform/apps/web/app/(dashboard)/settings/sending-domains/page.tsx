"use client";

/**
 * /settings/sending-domains
 * US-471: Custom sending domain setup — SPF/DKIM/DMARC verification.
 */

import { useState, useEffect } from "react";
import {
  Globe, Plus, Trash2, RefreshCw, CheckCircle2, XCircle, Clock,
  ChevronDown, ChevronUp, Copy, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SendingDomain {
  id:               string;
  domain:           string;
  verified:         boolean;
  verified_at:      string | null;
  spf_record:       string | null;
  dkim_selector:    string | null;
  dkim_public_key:  string | null;
  dmarc_record:     string | null;
  provider:         string;
  created_at:       string;
}

interface DnsCheck {
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
}

// ─── DNS record row ────────────────────────────────────────────────────────────

function DnsRecord({ label, name, type, value, ok }: {
  label: string;
  name: string;
  type: string;
  value: string;
  ok?: boolean;
}) {
  function copy() {
    navigator.clipboard.writeText(value).then(() => toast.success("Copied!"));
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{label}</span>
          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-mono text-slate-600">{type}</span>
        </div>
        {ok !== undefined && (
          ok
            ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            : <XCircle className="h-4 w-4 text-slate-300" />
        )}
      </div>
      <div className="text-[11px] text-slate-500">Name: <code className="font-mono text-slate-700">{name}</code></div>
      <div className="flex items-start gap-2">
        <code className="flex-1 text-[11px] font-mono text-slate-700 break-all leading-relaxed">{value}</code>
        <button
          onClick={copy}
          className="shrink-0 p-1 text-slate-400 hover:text-slate-600 transition-colors"
          title="Copy"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Domain card ──────────────────────────────────────────────────────────────

function DomainCard({ domain, onDelete, onVerify }: {
  domain: SendingDomain;
  onDelete: (id: string) => void;
  onVerify: (id: string) => Promise<DnsCheck>;
}) {
  const [expanded,  setExpanded]  = useState(!domain.verified);
  const [verifying, setVerifying] = useState(false);
  const [checks,    setChecks]    = useState<DnsCheck | null>(null);

  async function handleVerify() {
    setVerifying(true);
    try {
      const result = await onVerify(domain.id);
      setChecks(result);
      if (result.spf && result.dkim && result.dmarc) {
        toast.success("Domain verified! You can now send from this domain.");
      } else {
        toast.error("Verification failed — some DNS records are not yet propagated.");
      }
    } finally {
      setVerifying(false);
    }
  }

  const dkimName = domain.dkim_selector
    ? `${domain.dkim_selector}._domainkey.${domain.domain}`
    : `mail._domainkey.${domain.domain}`;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        <Globe className="h-4 w-4 text-slate-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">{domain.domain}</span>
            {domain.verified ? (
              <span className="flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                <CheckCircle2 className="h-2.5 w-2.5" /> Verified
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                <Clock className="h-2.5 w-2.5" /> Pending DNS
              </span>
            )}
          </div>
          {domain.verified_at && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Verified {new Date(domain.verified_at).toLocaleDateString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!domain.verified && (
            <button
              onClick={handleVerify}
              disabled={verifying}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-60"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", verifying && "animate-spin")} />
              {verifying ? "Checking…" : "Verify DNS"}
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <button
            onClick={() => onDelete(domain.id)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 transition-colors"
            title="Remove domain"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* DNS records */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/60 p-4 space-y-3">
          <p className="text-xs text-slate-600 font-medium mb-3">
            Add these DNS records to your domain registrar, then click Verify DNS.
          </p>

          {domain.spf_record && (
            <DnsRecord
              label="SPF"
              name={domain.domain}
              type="TXT"
              value={domain.spf_record}
              ok={checks?.spf}
            />
          )}

          {domain.dkim_selector && (
            <DnsRecord
              label="DKIM"
              name={dkimName}
              type="TXT"
              value={domain.dkim_public_key ?? `v=DKIM1; k=rsa; p=<DKIM_PUBLIC_KEY_FROM_PROVIDER>`}
              ok={checks?.dkim}
            />
          )}

          {domain.dmarc_record && (
            <DnsRecord
              label="DMARC"
              name={`_dmarc.${domain.domain}`}
              type="TXT"
              value={domain.dmarc_record}
              ok={checks?.dmarc}
            />
          )}

          {checks && !checks.spf && !checks.dkim && !checks.dmarc && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                DNS changes can take up to 48 hours to propagate. Come back later and try verifying again.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function SendingDomainsPage() {
  const [domains,  setDomains]  = useState<SendingDomain[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [newDomain, setNewDomain] = useState("");
  const [adding,   setAdding]   = useState(false);

  useEffect(() => {
    fetch("/api/sending-domains")
      .then(r => r.json())
      .then(d => setDomains(d.domains ?? []))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newDomain.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/sending-domains", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": "1" },
        body:    JSON.stringify({ domain: newDomain.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to add domain");
      const { domain: added } = await res.json();
      setDomains(prev => [added, ...prev]);
      setNewDomain("");
      toast.success(`${added.domain} added — publish the DNS records to verify.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add domain");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    const domain = domains.find(d => d.id === id);
    if (!confirm(`Remove ${domain?.domain}?`)) return;
    await fetch(`/api/sending-domains?id=${id}`, {
      method:  "DELETE",
      headers: { "x-csrf-token": "1" },
    });
    setDomains(prev => prev.filter(d => d.id !== id));
    toast.success("Domain removed");
  }

  async function handleVerify(id: string): Promise<DnsCheck> {
    const res = await fetch("/api/sending-domains/verify", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": "1" },
      body:    JSON.stringify({ domainId: id }),
    });
    const data = await res.json() as { verified: boolean; checks: DnsCheck };
    // Update verified state locally
    if (data.verified) {
      setDomains(prev => prev.map(d =>
        d.id === id ? { ...d, verified: true, verified_at: new Date().toISOString() } : d
      ));
    }
    return data.checks;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold text-foreground">Custom Sending Domain</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Send outreach emails from your own domain to improve deliverability and brand trust.
          Add SPF, DKIM, and DMARC records to verify ownership.
        </p>
      </div>

      {/* Add domain form */}
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={newDomain}
          onChange={e => setNewDomain(e.target.value)}
          placeholder="yourdomain.com"
          className="flex-1 rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
        <button
          type="submit"
          disabled={adding || !newDomain.trim()}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {adding ? "Adding…" : "Add Domain"}
        </button>
      </form>

      {/* Domain list */}
      {loading ? (
        <div className="space-y-3">
          {[1,2].map(i => (
            <div key={i} className="h-16 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : domains.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center">
          <Globe className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600 mb-1">No custom domains added yet</p>
          <p className="text-xs text-slate-400">
            Add your sending domain above to improve email deliverability.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {domains.map(d => (
            <DomainCard
              key={d.id}
              domain={d}
              onDelete={handleDelete}
              onVerify={handleVerify}
            />
          ))}
        </div>
      )}
    </div>
  );
}
