"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// US-308: only virtualise columns once they grow past this — smaller
// columns render normally so we don't add overhead for a handful of cards.
const VIRTUALIZATION_THRESHOLD = 40;
const ESTIMATED_CARD_HEIGHT    = 168;  // px — includes margin + typical card body
import type { PipelineStage, Application } from "@/types";
import {
  cn,
  getInitials,
  generateAvatarColor,
  formatRelativeTime,
} from "@/lib/utils";
import {
  Upload,
  CheckCircle2,
  Clock,
  MoreHorizontal,
  GripVertical,
  Star,
  Calendar,
  Mail,
  ClipboardList,
  FileSignature,
  BadgeCheck,
  BrainCircuit,
} from "lucide-react";
import { toast } from "sonner";

// ─── Stage Column ─────────────────────────────────────────────────────────────

const HEADER_COLORS: Record<string, string> = {
  sourced:       "bg-slate-100 border-slate-200",
  screened:      "bg-brand-50 border-brand-200",
  submitted:     "bg-violet-50 border-violet-200",
  client_review: "bg-amber-50 border-amber-200",
  interview:     "bg-emerald-50 border-emerald-200",
  offer:         "bg-cyan-50 border-cyan-200",
  placed:        "bg-teal-50 border-teal-200",
  rejected:      "bg-red-50 border-red-200",
  custom:        "bg-slate-50 border-slate-200",
};

const DOT_COLORS: Record<string, string> = {
  sourced:       "bg-slate-400",
  screened:      "bg-brand-500",
  submitted:     "bg-violet-500",
  client_review: "bg-amber-500",
  interview:     "bg-emerald-500",
  offer:         "bg-cyan-500",
  placed:        "bg-teal-500",
  rejected:      "bg-red-400",
  custom:        "bg-slate-400",
};

interface StageColumnProps {
  stage: PipelineStage;
  applications: Application[];
  isOver?: boolean;
  onSubmitToPortal?: (appId: string) => void;
  onScheduleInterview?: (app: Application) => void;
  onOutreach?: (app: Application) => void;
  onScorecard?: (app: Application) => void;
  onOffer?: (app: Application) => void;
  onInterviewPrep?: (app: Application) => void;
  scorecardedIds?: Set<string>;
  placedAppIds?: Set<string>;
}

function StageColumn({ stage, applications, isOver, onSubmitToPortal, onScheduleInterview, onOutreach, onScorecard, onOffer, onInterviewPrep, scorecardedIds, placedAppIds }: StageColumnProps) {
  const appIds = applications.map((a) => a.id);
  const headerClass = HEADER_COLORS[stage.type] ?? HEADER_COLORS.custom;
  const dotClass    = DOT_COLORS[stage.type] ?? DOT_COLORS.custom;

  // Count candidates breaching SLA
  const overdueCount = stage.slaDays
    ? applications.filter((a) => a.daysInStage > stage.slaDays!).length
    : 0;

  // US-308: virtualise only when the column is long enough to benefit.
  // Below threshold we render normally so DnD hit-testing stays simple.
  const shouldVirtualize = applications.length > VIRTUALIZATION_THRESHOLD;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: applications.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_CARD_HEIGHT,
    overscan: 6,        // keep a handful offscreen so quick drag hits resolve
    enabled: shouldVirtualize,
  });
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      className={cn(
        "flex w-[272px] flex-shrink-0 flex-col rounded-xl border bg-secondary/30 transition-colors",
        isOver && "bg-brand-50/60 ring-2 ring-brand-300"
      )}
    >
      {/* Header */}
      <div className={cn("flex items-center justify-between rounded-t-xl border-b px-3 py-2.5", headerClass)}>
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", dotClass)} />
          <span className="text-sm font-semibold text-foreground">{stage.name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-background/70 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
            {applications.length}
          </span>
          {stage.slaDays && (
            <span className={cn("flex items-center gap-0.5 text-[10px] font-medium",
              overdueCount > 0 ? "text-red-600" : "text-muted-foreground"
            )}>
              {overdueCount > 0 && <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">{overdueCount}</span>}
              SLA {stage.slaDays}d
            </span>
          )}
        </div>
      </div>

      {/* Drop zone */}
      <SortableContext items={appIds} strategy={verticalListSortingStrategy}>
        <div
          ref={scrollRef}
          className="flex flex-1 flex-col gap-2 overflow-y-auto p-2 min-h-[480px] max-h-[600px]"
        >
          {shouldVirtualize ? (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {virtualItems.map((v) => {
                const app = applications[v.index];
                return (
                  <div
                    key={app.id}
                    data-index={v.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${v.start}px)`,
                      paddingBottom: 8,    // preserves the gap-2 rhythm
                    }}
                  >
                    <SortableCard
                      application={app}
                      stageType={stage.type}
                      slaDays={stage.slaDays}
                      onSubmitToPortal={onSubmitToPortal}
                      onScheduleInterview={onScheduleInterview}
                      onOutreach={onOutreach}
                      onScorecard={onScorecard}
                      onOffer={onOffer}
                      onInterviewPrep={onInterviewPrep}
                      scorecardSubmitted={scorecardedIds?.has(app.id)}
                      isPlaced={placedAppIds?.has(app.id)}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              {applications.map((app) => (
                <SortableCard
                  key={app.id}
                  application={app}
                  stageType={stage.type}
                  slaDays={stage.slaDays}
                  onSubmitToPortal={onSubmitToPortal}
                  onScheduleInterview={onScheduleInterview}
                  onOutreach={onOutreach}
                  onScorecard={onScorecard}
                  onOffer={onOffer}
                  onInterviewPrep={onInterviewPrep}
                  scorecardSubmitted={scorecardedIds?.has(app.id)}
                  isPlaced={placedAppIds?.has(app.id)}
                />
              ))}
              {applications.length === 0 && (
                <div className="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed border-border py-8 text-xs text-muted-foreground">
                  Drop here
                </div>
              )}
            </>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

// ─── Sortable wrapper ─────────────────────────────────────────────────────────

interface SortableCardProps {
  application: Application;
  stageType: string;
  slaDays?: number;
  isDragOverlay?: boolean;
  onSubmitToPortal?: (appId: string) => void;
  onScheduleInterview?: (app: Application) => void;
  onOutreach?: (app: Application) => void;
  onScorecard?: (app: Application) => void;
  onOffer?: (app: Application) => void;
  onInterviewPrep?: (app: Application) => void;
  scorecardSubmitted?: boolean;
  isPlaced?: boolean;
}

function SortableCard({ application, stageType, slaDays, isDragOverlay, onSubmitToPortal, onScheduleInterview, onOutreach, onScorecard, onOffer, onInterviewPrep, scorecardSubmitted, isPlaced }: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: application.id,
  });

  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "opacity-40")}>
      <KanbanCard
        application={application}
        stageType={stageType}
        slaDays={slaDays}
        isDragOverlay={isDragOverlay}
        dragHandleProps={{ ...attributes, ...listeners }}
        onSubmitToPortal={onSubmitToPortal}
        onScheduleInterview={onScheduleInterview}
        onOutreach={onOutreach}
        onScorecard={onScorecard}
        onOffer={onOffer}
        onInterviewPrep={onInterviewPrep}
        scorecardSubmitted={scorecardSubmitted}
        isPlaced={isPlaced}
      />
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

interface KanbanCardProps {
  application: Application;
  stageType: string;
  slaDays?: number;
  isDragOverlay?: boolean;
  dragHandleProps?: Record<string, unknown>;
  onSubmitToPortal?: (appId: string) => void;
  onScheduleInterview?: (app: Application) => void;
  onOutreach?: (app: Application) => void;
  onScorecard?: (app: Application) => void;
  onOffer?: (app: Application) => void;
  onInterviewPrep?: (app: Application) => void;
  scorecardSubmitted?: boolean;
  isPlaced?: boolean;
}

function KanbanCard({ application: app, stageType, slaDays, isDragOverlay, dragHandleProps, onSubmitToPortal, onScheduleInterview, onOutreach, onScorecard, onOffer, onInterviewPrep, scorecardSubmitted, isPlaced }: KanbanCardProps) {
  const candidate = app.candidate;
  const days = app.daysInStage;

  // Use stage SLA if available; fallback to generic thresholds
  const sla       = slaDays ?? 7;
  const pct       = sla > 0 ? days / sla : 1;
  const agingClass =
    pct < 0.5  ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
    pct < 1.0  ? "bg-amber-50 text-amber-700 border-amber-200" :
                 "bg-red-50 text-red-700 border-red-200";

  const agingDot =
    pct < 0.5  ? "bg-emerald-500" :
    pct < 1.0  ? "bg-amber-500" :
                 "bg-red-500";

  const slaBreached = pct >= 1.0;

  return (
    <div
      className={cn(
        "group relative rounded-lg border border-border bg-card p-3 shadow-sm transition-shadow",
        isDragOverlay ? "rotate-1 shadow-lg ring-2 ring-brand-400" : "hover:shadow-md cursor-pointer"
      )}
    >
      {/* Drag grip */}
      <div
        {...(dragHandleProps as React.HTMLAttributes<HTMLDivElement>)}
        className="absolute left-1.5 top-1/2 -translate-y-1/2 cursor-grab touch-none opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Name row */}
      <div className="ml-3 flex items-start gap-2">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white",
            generateAvatarColor(candidate?.id ?? "x")
          )}
        >
          {getInitials(candidate?.fullName ?? "?")}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{candidate?.fullName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {candidate?.currentTitle}
            {candidate?.currentCompany ? ` · ${candidate.currentCompany}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onInterviewPrep && (
            <button
              onClick={(e) => { e.stopPropagation(); onInterviewPrep(app); }}
              title="Interview Prep"
              className="p-0.5 rounded text-muted-foreground hover:text-brand-600 transition-colors"
            >
              <BrainCircuit className="h-3.5 w-3.5" />
            </button>
          )}
          <button className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Aging + score */}
      <div className="ml-3 mt-2 flex items-center justify-between gap-2">
        <span className={cn("flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold", agingClass)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", agingDot)} />
          {days}d in stage
          {slaBreached && slaDays && <span className="ml-0.5 opacity-75">⚠</span>}
        </span>
        {app.score != null && (
          <span className="flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            {app.score}
          </span>
        )}
      </div>

      {/* Recruiter note */}
      {app.recruiterNote && (
        <p className="ml-3 mt-2 rounded bg-muted/60 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground line-clamp-2">
          {app.recruiterNote}
        </p>
      )}

      {/* Client decision */}
      {app.clientDecision === "advance" && (
        <div className="ml-3 mt-2 flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
          <CheckCircle2 className="h-3 w-3" />
          Client approved
        </div>
      )}

      {/* Submit / Schedule / Outreach actions */}
      <div className="ml-3 mt-2.5 flex flex-col gap-1.5">
        {stageType === "submitted" && !app.submittedToClientAt && (
          <button
            onClick={(e) => { e.stopPropagation(); onSubmitToPortal?.(app.id); }}
            className="flex flex-1 items-center justify-center gap-1 rounded-md bg-brand-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            <Upload className="h-3 w-3" />
            Submit to Portal
          </button>
        )}
        {app.submittedToClientAt && stageType !== "interview_scheduled" && (
          <div className="flex flex-1 items-center justify-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
            <CheckCircle2 className="h-3 w-3" />
            Submitted
          </div>
        )}
        {(stageType === "client_review" || stageType === "interview_scheduled") && onScheduleInterview && (
          <button
            onClick={(e) => { e.stopPropagation(); onScheduleInterview(app); }}
            className="flex flex-1 items-center justify-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
          >
            <Calendar className="h-3 w-3" />
            Schedule Interview
          </button>
        )}
        {(stageType === "client_review" || stageType === "interview" || stageType === "interview_scheduled") && onOutreach && (
          <button
            onClick={(e) => { e.stopPropagation(); onOutreach(app); }}
            className="flex flex-1 items-center justify-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2 py-1 text-[10px] font-semibold text-brand-700 hover:bg-brand-100 transition-colors"
          >
            <Mail className="h-3 w-3" />
            Send Outreach
          </button>
        )}
        {(stageType === "interview" || stageType === "interview_scheduled") && onScorecard && (
          scorecardSubmitted ? (
            <div className="flex flex-1 items-center justify-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
              <CheckCircle2 className="h-3 w-3" />
              Scorecard submitted
            </div>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onScorecard(app); }}
              className="flex flex-1 items-center justify-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700 hover:bg-violet-100 transition-colors"
            >
              <ClipboardList className="h-3 w-3" />
              Submit Scorecard
            </button>
          )
        )}
        {stageType === "offer" && onOffer && (
          <button
            onClick={(e) => { e.stopPropagation(); onOffer(app); }}
            className="flex flex-1 items-center justify-center gap-1 rounded-md border border-cyan-200 bg-cyan-50 px-2 py-1 text-[10px] font-semibold text-cyan-700 hover:bg-cyan-100 transition-colors"
          >
            <FileSignature className="h-3 w-3" />
            Manage Offer
          </button>
        )}
        {stageType === "placed" && isPlaced && (
          <div className="flex flex-1 items-center justify-center gap-1 rounded-md bg-teal-50 px-2 py-1 text-[10px] font-semibold text-teal-700">
            <BadgeCheck className="h-3 w-3" />
            Placed
          </div>
        )}
      </div>

      {/* Last activity */}
      <div className="ml-3 mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
        <Clock className="h-3 w-3" />
        {formatRelativeTime(app.lastActivityAt)}
      </div>
    </div>
  );
}

// ─── Board ────────────────────────────────────────────────────────────────────

export interface KanbanBoardProps {
  stages: PipelineStage[];
  applications: Application[];
  onSubmitToPortal?: (appId: string) => void;
  onStageChange?: (appId: string, newStageId: string) => void;
  onScheduleInterview?: (app: Application) => void;
  onOutreach?: (app: Application) => void;
  onScorecard?: (app: Application) => void;
  onOffer?: (app: Application) => void;
  onInterviewPrep?: (app: Application) => void;
  /** IDs of applications that have had scorecards submitted */
  scorecardedAppIds?: Set<string>;
  /** IDs of applications that have been confirmed as placements */
  placedAppIds?: Set<string>;
}

export function KanbanBoard({ stages, applications: init, onSubmitToPortal, onStageChange, onScheduleInterview, onOutreach, onScorecard, onOffer, onInterviewPrep, scorecardedAppIds, placedAppIds }: KanbanBoardProps) {
  const [applications, setApplications]         = useState(init);
  const [activeApp, setActiveApp]               = useState<Application | null>(null);
  const [overStageId, setOverStageId]           = useState<string | null>(null);
  const scorecardedIds = scorecardedAppIds ?? new Set<string>();
  const placedIds      = placedAppIds      ?? new Set<string>();

  // Sync local state when parent refetches data (prevents stale board after background refresh)
  useEffect(() => { setApplications(init); }, [init]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const appsByStage = useMemo(() => {
    const g: Record<string, Application[]> = {};
    stages.forEach((s) => (g[s.id] = []));
    applications.forEach((a) => { if (g[a.stageId] !== undefined) g[a.stageId].push(a); });
    return g;
  }, [stages, applications]);

  const appStageMap = useMemo(() => {
    const m: Record<string, string> = {};
    applications.forEach((a) => (m[a.id] = a.stageId));
    return m;
  }, [applications]);

  function onDragStart({ active }: DragStartEvent) {
    setActiveApp(applications.find((a) => a.id === active.id) ?? null);
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) { setOverStageId(null); return; }
    const overId = over.id as string;
    setOverStageId(stages.some((s) => s.id === overId) ? overId : (appStageMap[overId] ?? null));
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveApp(null);
    setOverStageId(null);
    if (!over) return;

    const activeId = active.id as string;
    const overId   = over.id as string;
    const targetStageId = stages.some((s) => s.id === overId) ? overId : appStageMap[overId];
    const sourceStageId = appStageMap[activeId];

    if (!targetStageId || targetStageId === sourceStageId) return;

    setApplications((prev) =>
      prev.map((a) => a.id === activeId ? { ...a, stageId: targetStageId, daysInStage: 0 } : a)
    );

    const stageName = stages.find((s) => s.id === targetStageId)?.name;
    toast.success(`Moved to ${stageName ?? "next stage"}`);
    onStageChange?.(activeId, targetStageId);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((stage) => (
          <StageColumn
            key={stage.id}
            stage={stage}
            applications={appsByStage[stage.id] ?? []}
            isOver={overStageId === stage.id}
            onSubmitToPortal={onSubmitToPortal}
            onScheduleInterview={onScheduleInterview}
            onOutreach={onOutreach}
            onScorecard={onScorecard}
            onOffer={onOffer}
            onInterviewPrep={onInterviewPrep}
            scorecardedIds={scorecardedIds}
            placedAppIds={placedIds}
          />
        ))}
      </div>

      <DragOverlay>
        {activeApp && (
          <KanbanCard
            application={activeApp}
            stageType={stages.find((s) => s.id === activeApp.stageId)?.type ?? "custom"}
            isDragOverlay
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}
