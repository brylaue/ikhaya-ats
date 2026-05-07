/**
 * Dashboard route-group layout.
 *
 * US-307: server component. All interactive concerns (global keyboard
 * shortcuts, onboarding + sync-opt-in modals, cross-tab logout, etc.)
 * are encapsulated in <DashboardShell /> so they don't force every
 * dashboard page to ship through the client boundary of this layout.
 */

import { DashboardShell } from "@/components/layout/dashboard-shell";

// Every dashboard route depends on the authenticated user's Supabase session
// (cookies, auth.uid()). They cannot be statically prerendered at build time —
// the Supabase client throws without runtime env vars, and the resulting
// HTML would leak across users anyway. Forcing `dynamic` on this layout opts
// the entire (dashboard) route group out of SSG.
export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
