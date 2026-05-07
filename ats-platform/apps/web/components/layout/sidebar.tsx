"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn, getInitials, generateAvatarColor } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { clearAgencyCache } from "@/lib/supabase/agency-cache";
import { broadcastLogout } from "@/components/auth/cross-tab-logout"; // US-360
import { useJobs, usePendingEmailMatchCount } from "@/lib/supabase/hooks";
import type { User } from "@supabase/supabase-js";
import {
  Users,
  Briefcase,
  Kanban,
  BarChart3,
  Building2,
  Settings,
  Search,
  ChevronDown,
  Zap,
  LogOut,
  HelpCircle,
  Mail,
  BadgeCheck,
  LayoutDashboard,
  FileBarChart2,
  Telescope,
  Calendar,
  ChevronRight,
} from "lucide-react";
import { NotificationsPanel } from "@/components/layout/notifications-panel";

// ─── Nav structure ─────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number | null;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Talent",
    items: [
      { label: "Candidates",  href: "/candidates",  icon: Users       },
      { label: "Pipeline",    href: "/pipeline",    icon: Kanban      },
      { label: "Interviews",  href: "/interviews",  icon: Calendar    },
      { label: "Placements",  href: "/placements",  icon: BadgeCheck  },
      { label: "Sourcing",    href: "/sourcing",    icon: Telescope   },
    ],
  },
  {
    label: "Client",
    items: [
      { label: "Jobs",     href: "/jobs",     icon: Briefcase  },
      { label: "Clients",  href: "/clients",  icon: Building2  },
      { label: "Outreach", href: "/outreach", icon: Mail       },
      { label: "BD",       href: "/bd",       icon: TrendingUp },
    ],
  },
  {
    label: "Reporting",
    items: [
      { label: "Analytics", href: "/analytics", icon: BarChart3     },
      { label: "Reports",   href: "/reports",   icon: FileBarChart2 },
    ],
  },
];

const BOTTOM_ITEMS = [
  { label: "Settings", href: "/settings", icon: Settings   },
  { label: "Help",     href: "/help",     icon: HelpCircle },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupContainsPath(group: NavGroup, pathname: string): boolean {
  return group.items.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/")
  );
}

// ─── NavGroup accordion ────────────────────────────────────────────────────────

function SidebarGroup({
  group,
  isOpen,
  onToggle,
  extraBadge,
}: {
  group: NavGroup;
  isOpen: boolean;
  onToggle: () => void;
  extraBadge?: { href: string; count: number };
}) {
  const pathname = usePathname();

  return (
    <div>
      {/* Group header */}
      <button
        onClick={onToggle}
        className={cn(
          "group flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-semibold uppercase tracking-widest transition-colors",
          isOpen
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <span>{group.label}</span>
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 transition-transform duration-200",
            isOpen && "rotate-90"
          )}
        />
      </button>

      {/* Group items */}
      {isOpen && (
        <ul className="mt-0.5 space-y-0.5 pl-1">
          {group.items.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            const badge = extraBadge?.href === item.href ? extraBadge.count : null;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isActive
                        ? "text-brand-600"
                        : "text-muted-foreground group-hover:text-foreground"
                    )}
                  />
                  <span className="flex-1 truncate">{item.label}</span>
                  {badge != null && badge > 0 && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                        isActive
                          ? "bg-brand-100 text-brand-700"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {badge}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname  = usePathname();
  const router    = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const { jobs }  = useJobs();
  const { count: pendingEmailCount } = usePendingEmailMatchCount();

  const activeJobs  = jobs.filter((j) => j.status === "active").slice(0, 5);
  const openCount   = activeJobs.length;

  // Default open state: expand the group whose route is active
  const defaultOpen = () => {
    const idx = NAV_GROUPS.findIndex((g) => groupContainsPath(g, pathname));
    return NAV_GROUPS.map((_, i) => i === idx || idx === -1 ? true : false);
  };

  const [openGroups, setOpenGroups] = useState<boolean[]>(defaultOpen);

  function toggleGroup(index: number) {
    setOpenGroups((prev) => prev.map((o, i) => (i === index ? !o : o)));
  }

  // Expand active group when route changes (e.g. link navigation)
  useEffect(() => {
    setOpenGroups((prev) =>
      NAV_GROUPS.map((g, i) =>
        groupContainsPath(g, pathname) ? true : prev[i]
      )
    );
  }, [pathname]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    const supabase = createClient();
    broadcastLogout("signed_out"); // US-360: notify other open tabs before signing out
    await supabase.auth.signOut();
    clearAgencyCache();
    router.push("/login");
  }

  const fullName  = (user?.user_metadata?.full_name as string | undefined) ?? user?.email?.split("@")[0] ?? "User";
  const email     = user?.email ?? "";
  const avatarUrl = (user?.user_metadata?.avatar_url as string | undefined) ?? null;
  const userId    = user?.id ?? "unknown";

  const isDashboard = pathname === "/dashboard";

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-[var(--sidebar-width)] flex-col border-r border-border bg-card">

      {/* ── Logo / Org ── */}
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 shadow-sm">
          <Zap className="h-4 w-4 text-white" strokeWidth={2.5} />
        </div>
        <div className="flex flex-1 items-center justify-between">
          <span className="text-sm font-semibold tracking-tight text-foreground">
            Ikhaya Talent
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>

      {/* ── Global search ── */}
      <div className="px-3 pt-3 pb-2">
        <button
          className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          onClick={() => document.dispatchEvent(new CustomEvent("open-search"))}
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">⌘K</kbd>
        </button>
      </div>

      {/* ── Main nav ── */}
      <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">

        {/* Dashboard — standalone, no group */}
        <Link
          href="/dashboard"
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
            isDashboard
              ? "bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <LayoutDashboard
            className={cn("h-4 w-4 shrink-0", isDashboard ? "text-brand-600" : "text-muted-foreground")}
          />
          <span>Dashboard</span>
        </Link>

        {/* Divider */}
        <div className="my-2 border-t border-border" />

        {/* Grouped nav sections */}
        <div className="space-y-1">
          {NAV_GROUPS.map((group, idx) => (
            <SidebarGroup
              key={group.label}
              group={group}
              isOpen={openGroups[idx] ?? false}
              onToggle={() => toggleGroup(idx)}
              extraBadge={
                group.label === "Client" && openCount > 0
                  ? { href: "/jobs", count: openCount }
                  : group.label === "Talent" && pendingEmailCount > 0
                  ? { href: "/candidates", count: pendingEmailCount }
                  : undefined
              }
            />
          ))}
        </div>

        {/* ── Unclaimed emails alert ── */}
        {pendingEmailCount > 0 && (
          <>
            <div className="my-2 border-t border-border" />
            <Link
              href="/integrations/email/review"
              className={cn(
                "group flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                pathname === "/integrations/email/review"
                  ? "bg-amber-50 text-amber-700"
                  : "text-amber-600 hover:bg-amber-50 hover:text-amber-700"
              )}
            >
              <div className="relative shrink-0">
                <Mail className="h-3.5 w-3.5" />
                <span className="absolute -top-0.5 -right-0.5 flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                </span>
              </div>
              <span className="flex-1">Unclaimed emails</span>
              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 leading-none">
                {pendingEmailCount}
              </span>
            </Link>
          </>
        )}

        {/* ── Active searches quick-access ── */}
        {activeJobs.length > 0 && (
          <>
            <div className="my-2 border-t border-border" />
            <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Active Searches
            </p>
            <ul className="space-y-0.5">
              {activeJobs.map((job) => (
                <li key={job.id}>
                  <Link
                    href={`/pipeline/${job.id}`}
                    className="flex items-center gap-2 rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <span className="truncate">{job.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </nav>

      {/* ── Bottom ── */}
      <div className="border-t border-border px-2 py-2">
        <ul className="space-y-0.5 mb-2">
          {BOTTOM_ITEMS.map((item) => {
            const Icon     = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                    isActive
                      ? "text-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-foreground" : "text-muted-foreground")} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* User row */}
        <button
          onClick={signOut}
          className="w-full flex items-center gap-2 rounded-md px-2.5 py-2 hover:bg-accent cursor-pointer group"
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={fullName}
              className="h-7 w-7 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white",
                generateAvatarColor(userId)
              )}
            >
              {getInitials(fullName)}
            </div>
          )}
          <div className="flex-1 overflow-hidden text-left">
            <p className="truncate text-xs font-medium text-foreground">{fullName}</p>
            <p className="truncate text-[10px] text-muted-foreground">{email}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <NotificationsPanel />
            <LogOut className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </button>
      </div>
    </aside>
  );
}
