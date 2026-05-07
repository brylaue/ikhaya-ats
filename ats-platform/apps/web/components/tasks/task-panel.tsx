"use client";

import { useState } from "react";
import {
  CheckSquare, Square, Plus, Clock, AlertCircle,
  Calendar, ChevronDown, X, Flag,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaskPriority = "high" | "medium" | "low";
export type TaskStatus   = "open" | "done";

export interface Task {
  id: string;
  title: string;
  dueDate?: string;       // ISO string
  priority: TaskPriority;
  status: TaskStatus;
  assigneeId?: string;
  assigneeName?: string;
  entityType: "candidate" | "job" | "client";
  entityId: string;
  createdAt: string;
}

// ─── Priority config ──────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; flagColor: string }> = {
  high:   { label: "High",   color: "border-red-200 bg-red-50",    flagColor: "text-red-500" },
  medium: { label: "Medium", color: "border-amber-200 bg-amber-50", flagColor: "text-amber-500" },
  low:    { label: "Low",    color: "border-slate-200 bg-slate-50", flagColor: "text-slate-400" },
};

// ─── Add Task Form ────────────────────────────────────────────────────────────

interface AddTaskFormProps {
  entityId: string;
  entityType: Task["entityType"];
  onAdd: (task: Task) => void;
  onCancel: () => void;
}

function AddTaskForm({ entityId, entityType, onAdd, onCancel }: AddTaskFormProps) {
  const [title, setTitle]       = useState("");
  const [dueDate, setDueDate]   = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({
      id: `task_${Date.now()}`,
      title: title.trim(),
      dueDate: dueDate || undefined,
      priority,
      status: "open",
      assigneeName: "Alex Rivera",
      entityType,
      entityId,
      createdAt: new Date().toISOString(),
    });
    setTitle("");
    setDueDate("");
    setPriority("medium");
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-brand-200 bg-brand-50/40 p-3 space-y-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task description…"
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
      />
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-md border border-border bg-card pl-8 pr-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
          className="rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!title.trim()}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40 transition-colors"
        >
          Add Task
        </button>
      </div>
    </form>
  );
}

// ─── Task Item ────────────────────────────────────────────────────────────────

interface TaskItemProps {
  task: Task;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

function TaskItem({ task, onToggle, onDelete }: TaskItemProps) {
  const isDone    = task.status === "done";
  const isOverdue = !isDone && task.dueDate && new Date(task.dueDate) < new Date();
  const priCfg    = PRIORITY_CONFIG[task.priority];

  return (
    <div className={cn(
      "group flex items-start gap-2.5 rounded-lg border p-2.5 transition-all",
      isDone ? "border-border bg-muted/30 opacity-60" : priCfg.color
    )}>
      <button
        onClick={() => onToggle(task.id)}
        className="mt-0.5 shrink-0 text-muted-foreground hover:text-brand-600 transition-colors"
      >
        {isDone
          ? <CheckSquare className="h-4 w-4 text-emerald-500" />
          : <Square className="h-4 w-4" />
        }
      </button>

      <div className="min-w-0 flex-1">
        <p className={cn("text-sm", isDone && "line-through text-muted-foreground")}>
          {task.title}
        </p>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          {task.dueDate && (
            <span className={cn(
              "flex items-center gap-1 text-[10px]",
              isOverdue ? "font-semibold text-red-600" : "text-muted-foreground"
            )}>
              {isOverdue && <AlertCircle className="h-3 w-3" />}
              <Clock className="h-3 w-3" />
              {isOverdue ? "Overdue · " : ""}{formatRelativeTime(task.dueDate)}
            </span>
          )}
          {task.assigneeName && (
            <span className="text-[10px] text-muted-foreground">· {task.assigneeName}</span>
          )}
          <Flag className={cn("h-3 w-3 ml-auto shrink-0", priCfg.flagColor)} />
        </div>
      </div>

      <button
        onClick={() => onDelete(task.id)}
        className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Task Panel ───────────────────────────────────────────────────────────────

interface TaskPanelProps {
  tasks: Task[];
  entityId: string;
  entityType: Task["entityType"];
  onTasksChange: (tasks: Task[]) => void;
  // Optional async persistence callbacks — when provided, changes persist to DB
  onAddTask?:    (input: { title: string; priority: TaskPriority; dueDate?: string }) => Promise<Task | null>;
  onToggleTask?: (id: string) => Promise<void>;
  onDeleteTask?: (id: string) => Promise<void>;
}

export function TaskPanel({ tasks, entityId, entityType, onTasksChange, onAddTask, onToggleTask, onDeleteTask }: TaskPanelProps) {
  const [showAdd, setShowAdd]         = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const open      = tasks.filter((t) => t.status === "open");
  const done      = tasks.filter((t) => t.status === "done");
  const overdue   = open.filter((t) => t.dueDate && new Date(t.dueDate) < new Date());

  async function handleAdd(task: Task) {
    if (onAddTask) {
      const persisted = await onAddTask({ title: task.title, priority: task.priority, dueDate: task.dueDate });
      if (persisted) {
        onTasksChange([persisted, ...tasks]);
        setShowAdd(false);
        toast.success("Task added");
      }
    } else {
      onTasksChange([task, ...tasks]);
      setShowAdd(false);
      toast.success("Task added");
    }
  }

  async function handleToggle(id: string) {
    if (onToggleTask) {
      await onToggleTask(id);
      onTasksChange(tasks.map((t) =>
        t.id === id ? { ...t, status: t.status === "open" ? "done" : "open" } : t
      ));
    } else {
      onTasksChange(tasks.map((t) =>
        t.id === id ? { ...t, status: t.status === "open" ? "done" : "open" } : t
      ));
    }
  }

  async function handleDelete(id: string) {
    if (onDeleteTask) {
      await onDeleteTask(id);
      onTasksChange(tasks.filter((t) => t.id !== id));
    } else {
      onTasksChange(tasks.filter((t) => t.id !== id));
    }
    toast.success("Task removed");
  }

  // Sort: overdue first, then by due date, then undated
  const sortedOpen = [...open].sort((a, b) => {
    const aOver = a.dueDate && new Date(a.dueDate) < new Date();
    const bOver = b.dueDate && new Date(b.dueDate) < new Date();
    if (aOver && !bOver) return -1;
    if (!aOver && bOver) return 1;
    if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tasks</p>
          {open.length > 0 && (
            <span className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none",
              overdue.length > 0 ? "bg-red-100 text-red-700" : "bg-brand-100 text-brand-700"
            )}>
              {open.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-brand-600 hover:bg-brand-50 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />Add
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <AddTaskForm
          entityId={entityId}
          entityType={entityType}
          onAdd={handleAdd}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* Open tasks */}
      {sortedOpen.length > 0 ? (
        <div className="space-y-1.5">
          {sortedOpen.map((task) => (
            <TaskItem key={task.id} task={task} onToggle={handleToggle} onDelete={handleDelete} />
          ))}
        </div>
      ) : (
        !showAdd && (
          <p className="py-2 text-center text-xs text-muted-foreground">No open tasks</p>
        )
      )}

      {/* Completed tasks (collapsible) */}
      {done.length > 0 && (
        <div>
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className="flex w-full items-center gap-1.5 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className={cn("h-3 w-3 transition-transform", showCompleted && "rotate-180")} />
            {done.length} completed
          </button>
          {showCompleted && (
            <div className="mt-1.5 space-y-1.5">
              {done.map((task) => (
                <TaskItem key={task.id} task={task} onToggle={handleToggle} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
