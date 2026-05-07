"use client";
/**
 * IP Allowlist Page — US-404: IP Allowlist & Geo Restrictions
 */

import { useState } from "react";
import { Shield, Plus, Trash2, Power } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIpAllowlist } from "@/lib/supabase/hooks";
import { toast } from "sonner";

const CIDR_RE = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$|^::\/\d{1,3}$/;

export default function IpAllowlistPage() {
  const { rules, loading, addRule, deleteRule, toggleRule } = useIpAllowlist();
  const [cidr, setCidr] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!CIDR_RE.test(cidr.trim())) { toast.error("Enter a valid CIDR range (e.g. 203.0.113.0/24)"); return; }
    setAdding(true);
    try {
      await addRule(cidr.trim(), label.trim() || undefined);
      setCidr(""); setLabel("");
      toast.success("Rule added");
    } catch { toast.error("Failed to add rule"); }
    finally { setAdding(false); }
  }

  const activeRules = rules.filter(r => r.isActive);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">IP Allowlist</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Restrict logins to specific IP ranges.
          {activeRules.length > 0
            ? ` ${activeRules.length} active rule${activeRules.length !== 1 ? "s" : ""} — only listed CIDRs can log in.`
            : " No active rules — all IPs permitted."}
        </p>
      </div>

      <form onSubmit={handleAdd} className="flex items-end gap-3 p-4 rounded-xl border border-border bg-muted/20">
        <div className="flex-1">
          <label className="text-xs font-medium text-foreground block mb-1">CIDR range</label>
          <input type="text" value={cidr} onChange={e => setCidr(e.target.value)}
            placeholder="203.0.113.0/24"
            className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-brand-600 bg-card" />
        </div>
        <div className="flex-1">
          <label className="text-xs font-medium text-foreground block mb-1">Label (optional)</label>
          <input type="text" value={label} onChange={e => setLabel(e.target.value)}
            placeholder="e.g. Office VPN"
            className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-brand-600 bg-card" />
        </div>
        <button type="submit" disabled={adding || !cidr}
          className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors">
          <Plus className="h-4 w-4" />
          Add rule
        </button>
      </form>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : rules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Shield className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No IP rules configured — all IPs permitted.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
          {rules.map(r => (
            <div key={r.id} className={cn("flex items-center gap-3 px-4 py-3", !r.isActive && "opacity-50")}>
              <Shield className={cn("h-4 w-4 shrink-0", r.isActive ? "text-brand-600" : "text-muted-foreground")} />
              <div className="flex-1">
                <p className="text-sm font-mono font-medium text-foreground">{r.cidr}</p>
                {r.label && <p className="text-xs text-muted-foreground">{r.label}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => toggleRule(r.id, !r.isActive)} title={r.isActive ? "Disable" : "Enable"}
                  className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                  <Power className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={async () => { await deleteRule(r.id); toast.success("Rule removed"); }}
                  className="p-1.5 text-muted-foreground hover:text-red-600 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
