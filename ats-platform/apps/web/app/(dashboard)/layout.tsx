/**
 * Dashboard route-group layout.
 *
 * US-307: server component. All interactive concerns (global keyboard
 * shortcuts, onboarding + sync-opt-in modals, cross-tab logout, etc.)
 * are encapsulated in <DashboardShell /> so they don't force every
 * dashboard page to ship through the client boundary of this layout.
 */

import { DashboardShell } from "@/components/layout/dashboard-shell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
