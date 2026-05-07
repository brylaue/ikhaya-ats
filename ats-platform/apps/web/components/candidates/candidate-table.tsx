"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type ColumnFiltersState,
  type RowSelectionState,
} from "@tanstack/react-table";
import type { Candidate } from "@/types";
import {
  cn,
  formatRelativeTime,
  formatSalary,
  getInitials,
  generateAvatarColor,
  STATUS_LABELS,
  STATUS_COLORS,
  truncate,
} from "@/lib/utils";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Mail,
  Linkedin,
  MoreHorizontal,
  MapPin,
  Star,
  CheckCircle2,
  Circle,
  Columns2,
  Users,
  Download,
  Tag,
  Archive,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";

const col = createColumnHelper<Candidate>();

interface CandidateTableProps {
  data: Candidate[];
  onRowClick?: (candidate: Candidate) => void;
  onCompare?: (ids: string[]) => void;
}

const ROW_HEIGHT = 52; // approximate px height of each table row

export function CandidateTable({ data, onRowClick, onCompare }: CandidateTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "lastActivityAt", desc: true },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // Scroll container ref for react-virtual (US-305)
  const scrollRef = useRef<HTMLDivElement>(null);

  const columns = useMemo(
    () => [
      // Checkbox
      col.display({
        id: "select",
        size: 40,
        header: ({ table }) => (
          <input
            type="checkbox"
            className="rounded border-border"
            checked={table.getIsAllPageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="rounded border-border"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            onClick={(e) => e.stopPropagation()}
          />
        ),
      }),

      // Name + avatar
      col.accessor("fullName", {
        id: "fullName",
        size: 220,
        header: ({ column }) => <SortHeader column={column} label="Name" />,
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white",
                  generateAvatarColor(c.id)
                )}
              >
                {getInitials(c.fullName)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {c.fullName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {c.email}
                </p>
              </div>
            </div>
          );
        },
      }),

      // Title + company
      col.accessor("currentTitle", {
        id: "currentTitle",
        size: 200,
        header: ({ column }) => <SortHeader column={column} label="Current Role" />,
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground">
                {c.currentTitle ?? "—"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {c.currentCompany ?? ""}
              </p>
            </div>
          );
        },
      }),

      // Location
      col.accessor("location", {
        id: "location",
        size: 140,
        header: "Location",
        cell: ({ row }) => {
          const loc = row.original.location;
          if (!loc) return <span className="text-muted-foreground text-xs">—</span>;
          const parts = [loc.city, loc.state].filter(Boolean).join(", ");
          return (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{parts || loc.country || "—"}</span>
              {loc.remote && (
                <span className="ml-1 rounded-sm bg-emerald-50 px-1 py-0.5 text-[10px] font-medium text-emerald-700">
                  Remote OK
                </span>
              )}
            </div>
          );
        },
      }),

      // Skills
      col.accessor("skills", {
        id: "skills",
        size: 180,
        enableSorting: false,
        header: "Top Skills",
        cell: ({ row }) => {
          const skills = row.original.skills.slice(0, 3);
          return (
            <div className="flex flex-wrap gap-1">
              {skills.map((cs) => (
                <span
                  key={cs.skillId}
                  className="rounded-sm bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground"
                >
                  {cs.skill.name}
                </span>
              ))}
            </div>
          );
        },
      }),

      // Status
      col.accessor("status", {
        id: "status",
        size: 110,
        header: ({ column }) => <SortHeader column={column} label="Status" />,
        cell: ({ row }) => {
          const status = row.original.status;
          return (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                STATUS_COLORS[status]
              )}
            >
              {STATUS_LABELS[status]}
            </span>
          );
        },
      }),

      // Desired salary
      col.accessor("desiredSalary", {
        id: "desiredSalary",
        size: 110,
        header: ({ column }) => <SortHeader column={column} label="Desired Comp" />,
        cell: ({ row }) => {
          const { desiredSalary, salaryCurrency } = row.original;
          if (!desiredSalary)
            return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <span className="text-xs text-foreground">
              {formatSalary(desiredSalary, salaryCurrency ?? "USD", true)}
            </span>
          );
        },
      }),

      // Tags
      col.accessor("tags", {
        id: "tags",
        size: 140,
        enableSorting: false,
        header: "Tags",
        cell: ({ row }) => {
          const tags = row.original.tags.slice(0, 2);
          return (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span
                  key={tag.id}
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                  style={{
                    backgroundColor: tag.color + "22",
                    color: tag.color,
                  }}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          );
        },
      }),

      // Owner
      col.accessor("owner", {
        id: "owner",
        size: 110,
        header: "Owner",
        cell: ({ row }) => {
          const owner = row.original.owner;
          if (!owner)
            return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white shrink-0",
                  generateAvatarColor(owner.id)
                )}
              >
                {getInitials(owner.fullName)}
              </div>
              <span className="truncate text-xs text-muted-foreground">
                {owner.firstName}
              </span>
            </div>
          );
        },
      }),

      // Last activity
      col.accessor("lastActivityAt", {
        id: "lastActivityAt",
        size: 110,
        header: ({ column }) => <SortHeader column={column} label="Last Activity" />,
        cell: ({ row }) => {
          const date = row.original.lastActivityAt;
          if (!date) return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(date)}
            </span>
          );
        },
      }),

      // Actions
      col.display({
        id: "actions",
        size: 60,
        cell: ({ row }) => (
          <div
            className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <a
              href={`mailto:${row.original.email}`}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Mail className="h-3.5 w-3.5" />
            </a>
            {row.original.linkedinUrl && (
              <a
                href={row.original.linkedinUrl}
                target="_blank"
                rel="noreferrer"
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Linkedin className="h-3.5 w-3.5" />
              </a>
            )}
            <button className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>
        ),
      }),
    ],
    []
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, rowSelection },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableRowSelection: true,
  });

  const rows = table.getRowModel().rows;

  // Virtualizer — only renders visible rows in the DOM (US-305)
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();
  const paddingTop    = virtualRows.length > 0 ? (virtualRows[0]?.start ?? 0)                              : 0;
  const paddingBottom = virtualRows.length > 0 ? totalHeight - (virtualRows[virtualRows.length - 1]?.end ?? 0) : 0;

  const selectedCount = Object.keys(rowSelection).length;

  // ─── Bulk action helpers ────────────────────────────────────────────────────

  const [bulkLoading, setBulkLoading] = useState<string | null>(null);
  const [tagInput,    setTagInput]    = useState("");
  const [showTagInput, setShowTagInput] = useState(false);

  const getSelectedIds = useCallback(() =>
    table.getSelectedRowModel().rows.map((r) => r.original.id),
  [table]);

  const getSelectedCandidates = useCallback(() =>
    table.getSelectedRowModel().rows.map((r) => r.original),
  [table]);

  async function bulkAction(action: string, extra: Record<string, string> = {}) {
    const ids = getSelectedIds();
    if (!ids.length) return;
    setBulkLoading(action);
    try {
      const res = await fetch("/api/candidates/bulk", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids, ...extra }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const { updated } = await res.json();
      toast.success(`${updated} candidate${updated !== 1 ? "s" : ""} updated`);
      setRowSelection({});
    } catch (e: any) {
      toast.error(e.message ?? "Bulk action failed");
    } finally {
      setBulkLoading(null);
    }
  }

  function exportCsv() {
    const candidates = getSelectedCandidates();
    const headers = ["Name", "Email", "Title", "Company", "Location", "Status", "Tags"];
    const rows = candidates.map((c) => [
      `${c.firstName} ${c.lastName}`,
      c.email ?? "",
      c.currentTitle ?? "",
      c.currentCompany ?? "",
      c.location ?? "",
      c.status ?? "",
      (c.skills ?? []).join("; "),
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `candidates-export-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${candidates.length} candidates`);
  }

  async function applyTag() {
    if (!tagInput.trim()) return;
    await bulkAction("tag", { tag: tagInput.trim() });
    setTagInput("");
    setShowTagInput(false);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Bulk action bar */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-2 border-b border-border bg-brand-50 px-6 py-2 text-sm flex-wrap">
          <span className="font-semibold text-brand-800 mr-1">
            {selectedCount} selected
          </span>
          <div className="h-4 w-px bg-brand-200 mx-1" />

          {/* Add Tag */}
          {showTagInput ? (
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => { e.preventDefault(); applyTag(); }}
            >
              <input
                autoFocus
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Tag name…"
                className="h-6 rounded border border-brand-300 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white"
              />
              <button type="submit" disabled={!!bulkLoading} className="text-xs font-medium text-brand-700 hover:text-brand-900 disabled:opacity-50">
                {bulkLoading === "tag" ? <Loader2 className="h-3 w-3 animate-spin" /> : "Apply"}
              </button>
              <button type="button" onClick={() => setShowTagInput(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-3 w-3" />
              </button>
            </form>
          ) : (
            <button
              onClick={() => setShowTagInput(true)}
              className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-900"
            >
              <Tag className="h-3.5 w-3.5" />
              Add Tag
            </button>
          )}

          <div className="h-4 w-px bg-brand-200 mx-1" />

          {/* Archive */}
          <button
            onClick={() => bulkAction("archive")}
            disabled={!!bulkLoading}
            className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-900 disabled:opacity-50"
          >
            {bulkLoading === "archive"
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Archive className="h-3.5 w-3.5" />
            }
            Archive
          </button>

          {/* Unarchive (only meaningful if any selected rows are archived, but
              always allow to avoid exposing archive state in the toolbar) */}
          <button
            onClick={() => bulkAction("unarchive")}
            disabled={!!bulkLoading}
            className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-900 disabled:opacity-50"
            title="Restore archived candidates to active"
          >
            {bulkLoading === "unarchive"
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <CheckCircle2 className="h-3.5 w-3.5" />
            }
            Unarchive
          </button>

          <div className="h-4 w-px bg-brand-200 mx-1" />

          {/* Export CSV */}
          <button
            onClick={exportCsv}
            className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-900"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>

          {onCompare && selectedCount >= 2 && selectedCount <= 4 && (
            <>
              <div className="h-4 w-px bg-brand-200 mx-1" />
              <button
                onClick={() => {
                  const selectedRows = table.getSelectedRowModel().rows;
                  onCompare(selectedRows.map((r) => r.original.id));
                }}
                className="flex items-center gap-1 text-brand-700 hover:text-brand-900 text-xs font-semibold"
              >
                <Columns2 className="h-3.5 w-3.5" />
                Compare {selectedCount}
              </button>
            </>
          )}

          <div className="ml-auto">
            <button
              onClick={() => setRowSelection({})}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div ref={scrollRef} className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border">
              {table.getHeaderGroups()[0].headers.map((header) => (
                <th
                  key={header.id}
                  className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground"
                  style={{ width: header.getSize() }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paddingTop > 0 && (
              <tr>
                <td style={{ height: paddingTop }} colSpan={columns.length} />
              </tr>
            )}
            {virtualRows.map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "group/row border-b border-border transition-colors cursor-pointer",
                    row.getIsSelected()
                      ? "bg-brand-50/70"
                      : "hover:bg-accent/50"
                  )}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-3 py-2.5 align-middle"
                      style={{ width: cell.column.getSize() }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
            {paddingBottom > 0 && (
              <tr>
                <td style={{ height: paddingBottom }} colSpan={columns.length} />
              </tr>
            )}
          </tbody>
        </table>

        {rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
              <Users className="h-5 w-5 text-muted-foreground/60" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              {data.length === 0 ? "No candidates yet" : "No matches"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground max-w-xs">
              {data.length === 0
                ? "Import a CSV or add candidates manually to get started."
                : "Try clearing filters or adjusting your search."}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border px-6 py-2 text-xs text-muted-foreground">
        <span>{data.length} candidates</span>
        <span>
          {table.getFilteredRowModel().rows.length} shown
        </span>
      </div>
    </div>
  );
}

function SortHeader({
  column,
  label,
}: {
  column: { getIsSorted: () => false | "asc" | "desc"; toggleSorting: (desc?: boolean) => void };
  label: string;
}) {
  const sorted = column.getIsSorted();
  return (
    <button
      className="flex items-center gap-1 hover:text-foreground transition-colors"
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {label}
      {sorted === "asc" ? (
        <ArrowUp className="h-3 w-3" />
      ) : sorted === "desc" ? (
        <ArrowDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}
