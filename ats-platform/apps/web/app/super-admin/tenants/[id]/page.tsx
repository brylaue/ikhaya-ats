"use client";

/**
 * /super-admin/tenants/[id]
 * US-457: Per-tenant drill-down page.
 *
 * Shows org details, user list, usage breakdown, active integrations,
 * compliance status, and last 10 audit events.
 */

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Users,
  Briefcase,
  UserCheck,
  FileStack,
  TrendingUp,
  Mail,
  ShieldCheck,
  Clock,
  Activity,
  LogIn,
  LogOut,
  ToggleLeft,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Agency {
  id: string;
  name: string;
  domain: string | null;
  plan: string;
  created_at: string;
  plan_expires_at: string | null;
}

interface UserRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  last_login_at: string | null;
  is_active: boolean;
}

interface Integration {
  provider: string;
  status: string;
}

interface AuditEvent {
  id: string;
  action: string;
  resource_type: string;
  performed_at: string;
  detail: Record<string, unknown>;
}

interface TenantDetail {
  agency:           Agency;
  users:            UserRow[];
  jobCount:         number;
  candidateCount:   number;
  applicationCount: number;
  placementCount:   number;
  integrations:     Integration[];
  auditEvents:      AuditEvent[];
  openDsarCount:    number;
}

const PLAN_COLORS: Record<string, string> = {
  starter:    "bg-slate-700 text-slate-200",
  growth:     "bg-blue-900  text-blue-200",
  pro:        "bg-violet-900 text-violet-200",
  enterprise: "bg-amber-900 text-amber-200",
};

const ROLE_COLORS: Record<string, string> = {
  owner:           "text-amber-400",
  admin:           "text-indigo-400",
  senior_recruiter: "text-violet-400",
  recruiter:       "text-slate-300",
  viewer:          "text-slate-500",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData]           = useState<TenantDetail | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [impersonating, setImp]   = useState(false);
  const [impActive, setImpActive] = useState(false);

  useEffect(() => {
    fetch(`/api/super-admin/tenants/${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d);
        setLoading(false);
      })
      .catch(() => { setError("Failed to load tenant"); setLoading(false); });
  }, [id]);

  if (loading) {
    return (
      <div className="p-8 text-slate-400 text-sm">Loading…</div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8">
        <p className="text-red-400 text-sm">{error ?? "Unknown error"}</p>
        <Link href="/super-admin/tenants" className="mt-3 text-xs text-indigo-400 hover:text-indigo-300">
          ← Back to tenant list
        </Link>
      </div>
    );
  }

  const { agency, users, auditEvents, integrations, openDsarCount } = data;

  async function startImpersonation() {
    setImp(true);
    const res = await fetch(`/api/super-admin/tenants/${id}/impersonate`, { method: "POST" });
    const d = await res.json();
    if (d.ok) {
      setImpActive(true);
      window.location.href = "/candidates";
    }
    setImp(false);
  }

  async function endImpersonation() {
    setImp(true);
    await fetch(`/api/super-admin/tenants/${id}/impersonate`, { method: "DELETE" });
    setImpActive(false);
    setImp(false);
  }

  const usageCards = [
    { label: "Jobs",         value: data.jobCount,         icon: Briefcase  },
    { label: "Candidates",   value: data.candidateCount,   icon: UserCheck  },
    { label: "Applications", value: data.applicationCount, icon: FileStack  },
    { label: "Placements",   value: data.placementCount,   icon: TrendingUp },
    { label: "Team Members", value: users.length,           icon: Users      },
    { label: "Open DSARs",   value: openDsarCount,          icon: ShieldCheck },
  ];

  return (
    <div className="p-8 space-y-8 max-w-5xl">
      {/* Back */}
      <Link
        href="/super-admin/tenants"
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to tenant list
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-slate-400" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{agency.name}</h1>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${PLAN_COLORS[agency.plan] ?? "bg-slate-700 text-slate-200"}`}>
                {agency.plan}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-sm text-slate-400">
              {agency.domain && <span>{agency.domain}</span>}
              <span>Created {new Date(agency.created_at).toLocaleDateString()}</span>
              {agency.plan_expires_at && (
                <span className="text-amber-400">
                  Plan expires {new Date(agency.plan_expires_at).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 shrink-0">
          <a
            href={`/super-admin/feature-flags?tenant=${id}`}
            className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 transition-colors"
          >
            <ToggleLeft className="h-3.5 w-3.5" />
            Feature Flags
          </a>
          {impActive ? (
            <button
              onClick={endImpersonation}
              disabled={impersonating}
              className="flex items-center gap-1.5 rounded-md border border-red-700 bg-red-950/50 px-3 py-1.5 text-xs text-red-300 hover:bg-red-900/50 disabled:opacity-40 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              End Impersonation
            </button>
          ) : (
            <button
              onClick={startImpersonation}
              disabled={impersonating}
              className="flex items-center gap-1.5 rounded-md border border-amber-700 bg-amber-950/50 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-900/50 disabled:opacity-40 transition-colors"
            >
              <LogIn className="h-3.5 w-3.5" />
              {impersonating ? "Starting…" : "Impersonate"}
            </button>
          )}
        </div>
      </div>

      {/* Usage grid */}
      <div>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Usage</h2>
        <div className="grid grid-cols-3 gap-3">
          {usageCards.map(card => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <Icon className="h-4 w-4 text-slate-500 mb-2" />
                <div className="text-2xl font-bold text-white tabular-nums">{card.value.toLocaleString()}</div>
                <div className="text-xs text-slate-400 mt-0.5">{card.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Users */}
      <div>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Team Members ({users.length})
        </h2>
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/60">
              <tr>
                {["Name", "Email", "Role", "Last Login", "Status"].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {users.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500 text-xs">No users</td></tr>
              ) : users.map(u => (
                <tr key={u.id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-2.5 font-medium text-white">
                    {u.first_name} {u.last_name}
                  </td>
                  <td className="px-4 py-2.5 text-slate-400 text-xs">{u.email}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs capitalize ${ROLE_COLORS[u.role] ?? "text-slate-300"}`}>
                      {u.role.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : "Never"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-semibold ${u.is_active ? "text-emerald-400" : "text-red-400"}`}>
                      {u.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Integrations */}
      {integrations.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Active Integrations
          </h2>
          <div className="flex flex-wrap gap-2">
            {integrations.map((intg, i) => (
              <span
                key={i}
                className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-300"
              >
                <Mail className="h-3 w-3 text-slate-500" />
                {intg.provider}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recent audit events */}
      <div>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Recent Audit Events
        </h2>
        {auditEvents.length === 0 ? (
          <p className="text-sm text-slate-500">No audit events recorded.</p>
        ) : (
          <div className="space-y-1.5">
            {auditEvents.map(ev => (
              <div key={ev.id} className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900 px-4 py-2.5">
                <Activity className="h-3.5 w-3.5 text-slate-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-mono text-indigo-300">{ev.action}</span>
                  {ev.resource_type && (
                    <span className="text-xs text-slate-500 ml-2">on {ev.resource_type}</span>
                  )}
                </div>
                <div className="text-[11px] text-slate-600 flex items-center gap-1 shrink-0">
                  <Clock className="h-3 w-3" />
                  {new Date(ev.performed_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
