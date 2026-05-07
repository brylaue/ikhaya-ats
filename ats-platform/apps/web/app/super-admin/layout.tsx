/**
 * /super-admin layout
 * US-455: Protected shell for Ikhaya super-admin routes.
 * Middleware already blocks non-super-admin emails with 404.
 */

import Link from "next/link";
import {
  LayoutDashboard, Building2, BarChart3, ToggleLeft, ScrollText,
  DollarSign, Plug, HeartPulse, CreditCard, LifeBuoy, FlaskConical,
} from "lucide-react";

const NAV = [
  { href: "/super-admin",                label: "Overview",       icon: LayoutDashboard },
  { href: "/super-admin/tenants",        label: "Tenants",        icon: Building2       },
  { href: "/super-admin/usage",          label: "Usage",          icon: BarChart3       },
  { href: "/super-admin/cost",           label: "Cost",           icon: DollarSign      },  // US-463
  { href: "/super-admin/integrations",   label: "Integrations",   icon: Plug            },  // US-464
  { href: "/super-admin/health",         label: "Tenant Health",  icon: HeartPulse      },  // US-465
  { href: "/super-admin/billing",        label: "Billing",        icon: CreditCard      },  // US-466
  { href: "/super-admin/support",        label: "Support",        icon: LifeBuoy        },  // US-467
  { href: "/super-admin/experiments",    label: "Experiments",    icon: FlaskConical    },  // US-511
  { href: "/super-admin/feature-flags",  label: "Feature Flags",  icon: ToggleLeft      },
  { href: "/super-admin/audit",          label: "Audit Log",      icon: ScrollText      },
];

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-800">
          <span className="text-xs font-bold tracking-widest text-indigo-400 uppercase">
            Super Admin
          </span>
          <p className="text-[10px] text-slate-500 mt-0.5">Ikhaya internal</p>
        </div>
        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="px-5 py-3 border-t border-slate-800">
          <Link
            href="/"
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            ← Back to app
          </Link>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
