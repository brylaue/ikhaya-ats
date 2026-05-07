"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Building2, Plus, ChevronRight, TrendingUp, Briefcase,
  CheckCircle2, X, Globe, Loader2,
} from "lucide-react";
import { cn, generateAvatarColor, getInitials } from "@/lib/utils";
import { toast } from "sonner";
import { useCompanies, useJobs, usePlacements, type DbCompany, type NewCompanyInput } from "@/lib/supabase/hooks";

// ─── Health dot ───────────────────────────────────────────────────────────────

function HealthDot({ score }: { score: number }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
      score >= 80 ? "bg-emerald-100 text-emerald-700" :
      score >= 60 ? "bg-amber-100 text-amber-700" :
                    "bg-red-100 text-red-700"
    )}>
      <span className={cn("h-1.5 w-1.5 rounded-full",
        score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : "bg-red-500"
      )} />
      {score}
    </span>
  );
}

// ─── Add Client Modal ─────────────────────────────────────────────────────────

const INDUSTRIES = [
  "Technology", "Enterprise Software", "Healthcare", "Finance",
  "Venture Capital", "Private Equity", "E-Commerce", "Media", "Other",
];

const COMPANY_SIZES = [
  "1–10", "11–50", "51–200", "201–500", "501–1,000", "1,001–5,000", "5,000+",
];

const CONTRACT_STATUSES = [
  { value: "prospect",    label: "Prospect"    },
  { value: "active",      label: "Active"      },
  { value: "on_hold",     label: "On Hold"     },
  { value: "churned",     label: "Churned"     },
];

interface AddClientModalProps {
  onClose: () => void;
  onAdd: (company: DbCompany) => void;
  addCompany: (input: NewCompanyInput) => Promise<DbCompany | null>;
}

function AddClientModal({ onClose, onAdd, addCompany }: AddClientModalProps) {
  const [form, setForm] = useState({
    name: "", industry: "Technology", website: "",
    size: "", arr: "", contractStatus: "prospect",
  });
  const [submitting, setSubmitting] = useState(false);

  const slug = form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Client name is required");
      return;
    }
    const arrNum = form.arr.trim() ? parseFloat(form.arr.replace(/[,$]/g, "")) : undefined;
    if (form.arr.trim() && isNaN(arrNum!)) {
      toast.error("Contract value must be a number");
      return;
    }
    setSubmitting(true);
    try {
      const result = await addCompany({
        name:           form.name.trim(),
        industry:       form.industry || undefined,
        website:        form.website.trim() || undefined,
        size:           form.size || undefined,
        arr:            arrNum,
        contractStatus: form.contractStatus,
      });
      if (!result) {
        toast.error("Failed to add client — please try again");
        return;
      }
      onAdd(result);
      toast.success(`${result.name} added`);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Unexpected error adding client");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-sm font-bold text-foreground">Add Client</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Create a new client relationship</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Company name */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">Company Name *</label>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Acme Corp"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Industry + Size */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">Industry</label>
              <select
                value={form.industry}
                onChange={(e) => setForm((p) => ({ ...p, industry: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
              >
                {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">Company Size</label>
              <select
                value={form.size}
                onChange={(e) => setForm((p) => ({ ...p, size: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Select…</option>
                {COMPANY_SIZES.map((s) => <option key={s} value={s}>{s} employees</option>)}
              </select>
            </div>
          </div>

          {/* Website */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">Website</label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="url"
                value={form.website}
                onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
                placeholder="https://acme.com"
                className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Contract status + ARR */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">Status</label>
              <select
                value={form.contractStatus}
                onChange={(e) => setForm((p) => ({ ...p, contractStatus: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
              >
                {CONTRACT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">Contract Value (ARR)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.arr}
                  onChange={(e) => setForm((p) => ({ ...p, arr: e.target.value }))}
                  placeholder="e.g. 50000"
                  className="w-full rounded-lg border border-border bg-background py-2 pl-6 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          </div>

          {form.name && (
            <p className="text-[11px] text-muted-foreground">
              Portal slug: <span className="font-medium text-foreground">{slug || "auto-generated"}</span>
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !form.name.trim()}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />Adding…</>
              ) : "Add Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface OptimisticClient {
  id: string; name: string; industry: string; portal_slug: string;
  contract_status: string; arr: number; website?: string;
}

export default function ClientsPage() {
  const { companies, loading, addCompany } = useCompanies();
  const { jobs }                           = useJobs();
  const { placements }                     = usePlacements();
  const [showAddModal, setShowAddModal] = useState(false);
  const [optimistic, setOptimistic]    = useState<OptimisticClient[]>([]);

  const allCompanies = [
    ...companies,
    ...optimistic.filter((o) => !companies.some((c) => c.id === o.id)),
  ];

  // Per-company derived counts
  const activeJobsByCompany = useMemo(() => {
    const map: Record<string, number> = {};
    for (const j of jobs) {
      if (j.status === "active" && j.clientId) {
        map[j.clientId] = (map[j.clientId] ?? 0) + 1;
      }
    }
    return map;
  }, [jobs]);

  const thisYear = new Date().getFullYear();
  const placementsYtdByCompany = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of placements) {
      const year = new Date(p.startDate ?? p.placedAt ?? "").getFullYear();
      if (year === thisYear && p.clientId) {
        map[p.clientId] = (map[p.clientId] ?? 0) + 1;
      }
    }
    return map;
  }, [placements, thisYear]);

  const rows = allCompanies.map((company) => ({
    client: {
      id:             company.id,
      name:           company.name,
      industry:       company.industry ?? "—",
      portalSlug:     company.portal_slug ?? company.id,
      healthScore:    company.contract_status === "active" ? 85 : 50,
      createdAt:      new Date().toISOString(),
      activeJobCount: activeJobsByCompany[company.id] ?? 0,
      placementsYtd:  placementsYtdByCompany[company.id] ?? 0,
      website:        company.website,
      contractStatus: company.contract_status,
    },
    pending: 0,
    revenue: company.arr ?? 0,
  }));

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Clients</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{loading ? "Loading…" : `${allCompanies.length} client relationship${allCompanies.length !== 1 ? "s" : ""}`}</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            <Plus className="h-4 w-4" />Add Client
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {rows.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 mb-4">
              <Building2 className="h-7 w-7 text-brand-500" />
            </div>
            <h3 className="text-base font-semibold text-foreground">No clients yet</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-xs">
              Add your first client to start tracking relationships and revenue.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-5 flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              <Plus className="h-4 w-4" />Add Client
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-card border-b border-border">
              <tr>
                {["Company", "Health", "Open Searches", "Pending Feedback", "Revenue Pipeline", ""].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ client, pending, revenue }) => (
                <tr
                  key={client.id}
                  className="border-b border-border hover:bg-accent/40 transition-colors cursor-pointer"
                >
                  <td className="px-5 py-4">
                    <Link href={`/clients/${client.id}`} className="flex items-center gap-3 group">
                      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white", generateAvatarColor(client.id))}>
                        {getInitials(client.name)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground group-hover:text-brand-600 transition-colors">{client.name}</p>
                        <p className="text-xs text-muted-foreground">{client.industry}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-5 py-4">
                    <HealthDot score={client.healthScore} />
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5 text-sm">
                      <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-semibold text-foreground">{client.activeJobCount}</span>
                      <span className="text-muted-foreground">· {client.placementsYtd} placed YTD</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    {pending > 0 ? (
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        {pending} awaiting
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />All reviewed
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5 text-sm">
                      <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium text-foreground">
                        {revenue > 0 ? `$${(revenue / 1000).toFixed(0)}k` : "—"}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <Link href={`/clients/${client.id}`} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                      View<ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAddModal && (
        <AddClientModal
          onClose={() => setShowAddModal(false)}
          addCompany={addCompany}
          onAdd={(company) => setOptimistic((prev) => [...prev, {
            id: company.id, name: company.name,
            industry: company.industry ?? "Technology",
            portal_slug: company.portal_slug ?? company.id,
            contract_status: company.contract_status ?? "prospect",
            arr: company.arr ?? 0,
          }])}
        />
      )}
    </div>
  );
}
