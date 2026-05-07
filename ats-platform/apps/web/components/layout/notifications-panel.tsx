"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Bell, X, CheckCircle2, Clock, Mail, Kanban,
  Star, AlertCircle, Bookmark, Users, Check, Dot,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useNotifications, type AppNotification, type NotifType } from "@/lib/supabase/hooks";

// Re-export types used locally
type Notification = AppNotification;

// ─── Icon config ──────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<NotifType, { icon: React.ElementType; iconClass: string; dotClass: string }> = {
  stage_change:    { icon: Kanban, iconClass: "bg-brand-100 text-brand-600",    dotClass: "bg-brand-500" },
  client_feedback: { icon: Star,         iconClass: "bg-amber-100 text-amber-600",  dotClass: "bg-amber-500" },
  task_due:        { icon: AlertCircle,  iconClass: "bg-red-100 text-red-600",      dotClass: "bg-red-500" },
  outreach_reply:  { icon: Mail,         iconClass: "bg-violet-100 text-violet-600",dotClass: "bg-violet-500" },
  saved_search:    { icon: Bookmark,     iconClass: "bg-teal-100 text-teal-600",    dotClass: "bg-teal-500" },
  placement:       { icon: CheckCircle2, iconClass: "bg-emerald-100 text-emerald-600", dotClass: "bg-emerald-500" },
  mention:         { icon: Users,        iconClass: "bg-slate-100 text-slate-600",  dotClass: "bg-slate-500" },
};

// ─── Notification Item ────────────────────────────────────────────────────────

function NotifItem({
  notif,
  onRead,
  onDismiss,
}: {
  notif: Notification;
  onRead: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const cfg = TYPE_CONFIG[notif.type];
  const Icon = cfg.icon;

  return (
    <div
      className={cn(
        "group relative flex gap-3 px-4 py-3 transition-colors",
        notif.read ? "bg-transparent" : "bg-brand-50/50",
        "hover:bg-accent/50"
      )}
    >
      {/* Unread dot */}
      {!notif.read && (
        <span className={cn("absolute left-1.5 top-4 h-1.5 w-1.5 rounded-full", cfg.dotClass)} />
      )}

      {/* Icon */}
      <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", cfg.iconClass)}>
        <Icon className="h-3.5 w-3.5" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {notif.href ? (
          <Link
            href={notif.href}
            onClick={() => onRead(notif.id)}
            className="block"
          >
            <p className={cn("text-xs font-semibold text-foreground leading-snug", !notif.read && "font-bold")}>
              {notif.title}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug line-clamp-2">{notif.body}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{formatRelativeTime(notif.createdAt)}</p>
          </Link>
        ) : (
          <div onClick={() => onRead(notif.id)} className="cursor-default">
            <p className={cn("text-xs font-semibold text-foreground", !notif.read && "font-bold")}>{notif.title}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">{notif.body}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{formatRelativeTime(notif.createdAt)}</p>
          </div>
        )}
      </div>

      {/* Dismiss */}
      <button
        onClick={() => onDismiss(notif.id)}
        className="mt-0.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function NotificationsPanel() {
  const [open,   setOpen]  = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const panelRef            = useRef<HTMLDivElement>(null);

  const { notifications, markRead, markAllRead, dismiss } = useNotifications();

  const unreadCount = notifications.filter((n) => !n.read).length;
  const visible = filter === "unread"
    ? notifications.filter((n) => !n.read)
    : notifications;

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative flex h-7 w-7 items-center justify-center rounded-md transition-colors",
          open ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
        )}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-brand-600 text-[9px] font-bold text-white leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-9 z-50 w-80 rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
              {unreadCount > 0 && (
                <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700 leading-none">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-[10px] font-medium text-brand-600 hover:underline"
                >
                  <Check className="h-3 w-3" />Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-0 border-b border-border px-4 pt-1">
            {(["all", "unread"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "pb-2 pt-1 px-2 text-xs font-medium border-b-2 transition-colors capitalize",
                  filter === f ? "border-brand-600 text-brand-600" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {f}
                {f === "unread" && unreadCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-brand-100 px-1.5 py-0.5 text-[9px] font-bold text-brand-700">
                    {unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-border">
            {visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Bell className="mb-2 h-8 w-8 text-muted-foreground/40" />
                <p className="text-xs font-medium text-muted-foreground">
                  {filter === "unread" ? "No unread notifications" : "No notifications"}
                </p>
              </div>
            ) : (
              visible.map((n) => (
                <NotifItem
                  key={n.id}
                  notif={n}
                  onRead={markRead}
                  onDismiss={dismiss}
                />
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-4 py-2.5">
            <Link
              href="/settings?section=notifications"
              onClick={() => setOpen(false)}
              className="text-[10px] text-muted-foreground hover:text-brand-600 transition-colors"
            >
              Notification settings →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
