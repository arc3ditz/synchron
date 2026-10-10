import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { Check, Pencil, Play, Plus, Search, Trash2 } from "lucide-react";

import type { Milestone, Project, Task } from "../types";
import { FORM_CONTROL } from "../theme";
import { resolveTaskContext } from "../domain/tasks";
import { isTaskStaleBacklog } from "../domain/nextStep";
import { getTodayKey } from "../utils/dates";
import { formatFullDate } from "../utils/dates";

type TasksProps = {
  tasks: Task[];
  milestones: Milestone[];
  projects?: Project[];
  dayResetHour: number;
  onAddTask: (data: Omit<Task, "id" | "createdAt" | "completed">) => void;
  onEditTask: (taskId: string, data: Omit<Task, "id" | "createdAt" | "completed">) => void;
  onDeleteTask: (taskId: string) => void;
  onToggleTask: (taskId: string) => void;
  onStartFocus: (entityId?: { taskId?: string; habitId?: number; projectId?: string; milestoneId?: string; title?: string }) => void;
};

type StatusFilter = "open" | "completed" | "all";
type PriorityFilter = "all" | Task["priority"];

const PRIORITY_RANK: Record<Task["priority"], number> = { high: 0, medium: 1, low: 2 };

// Selects build on the shared control spec so every dropdown matches inputs.
const selectStyle: CSSProperties = { ...FORM_CONTROL, width: "auto" };

const PRIORITY_DOT: Record<Task["priority"], string> = {
  high: "var(--priority-high-text)",
  medium: "var(--priority-medium-text)",
  low: "var(--priority-low-text)",
};

const PRIORITY_BADGE_CLASS: Record<Task["priority"], string> = {
  high: "ui-badge ui-badge--danger",
  medium: "ui-badge ui-badge--warning",
  low: "ui-badge ui-badge--subdued",
};

export default function Tasks({
  tasks,
  milestones,
  projects = [],
  dayResetHour,
  onAddTask,
  onEditTask,
  onDeleteTask,
  onToggleTask,
  onStartFocus,
}: TasksProps) {
  const todayKey = getTodayKey(dayResetHour);

  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("medium");
  const [dueDate, setDueDate] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [projectId, setProjectId] = useState("");
  const [milestoneId, setMilestoneId] = useState("");

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editPriority, setEditPriority] = useState<Task["priority"]>("medium");
  const [editDueDate, setEditDueDate] = useState("");
  const [editEstimatedMinutes, setEditEstimatedMinutes] = useState("");
  const [editScheduledTime, setEditScheduledTime] = useState("");
  const [editDurationMinutes, setEditDurationMinutes] = useState("");
  const [editProjectId, setEditProjectId] = useState("");
  const [editMilestoneId, setEditMilestoneId] = useState("");

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [projectFilter, setProjectFilter] = useState("");
  const [query, setQuery] = useState("");
  const [pendingDeletion, setPendingDeletion] = useState<Task | null>(null);

  const openCount = tasks.filter((task) => !task.completed).length;
  const completedCount = tasks.length - openCount;

  const availableProjects = useMemo(() => {
    const list = projects.filter((project) => project.status !== "archived");
    if (projectId !== "" && !list.some((project) => project.id === projectId)) {
      const current = projects.find((project) => project.id === projectId);
      return current ? [...list, current] : list;
    }
    return list;
  }, [projects, projectId]);

  const availableMilestones = useMemo(() => {
    const list = milestones.filter((milestone) => {
      if (projectId !== "") return milestone.projectId === projectId;
      return true;
    });
    if (milestoneId !== "" && !list.some((milestone) => milestone.id === milestoneId)) {
      const current = milestones.find((milestone) => milestone.id === milestoneId);
      return current ? [...list, current] : list;
    }
    return list;
  }, [milestones, projectId, milestoneId]);

  function resetAddForm() {
    setTitle("");
    setPriority("medium");
    setDueDate("");
    setEstimatedMinutes("");
    setProjectId("");
    setMilestoneId("");
  }

  function parseMinutes(value: string): number | undefined {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  function handleAddSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    onAddTask({
      title: trimmedTitle,
      priority,
      dueDate: dueDate || undefined,
      estimatedMinutes: parseMinutes(estimatedMinutes),
      projectId: projectId || undefined,
      milestoneId: milestoneId || undefined,
    });
    resetAddForm();
  }

  function beginEdit(task: Task) {
    setEditingTaskId(task.id);
    setEditTitle(task.title);
    setEditPriority(task.priority);
    setEditDueDate(task.dueDate ?? "");
    setEditEstimatedMinutes(task.estimatedMinutes?.toString() ?? "");
    setEditScheduledTime(task.scheduledTime ?? "");
    setEditDurationMinutes(task.durationMinutes?.toString() ?? "");
    setEditProjectId(task.projectId ?? "");
    setEditMilestoneId(task.milestoneId ?? "");
  }

  function handleEditSubmit(event: FormEvent<HTMLFormElement>, task: Task) {
    event.preventDefault();
    const trimmedTitle = editTitle.trim();
    if (!trimmedTitle) return;

    // Same scheduling semantics as Today: duration only applies alongside a
    // scheduled time, so clearing the time also clears the duration.
    // Legacy goalId links are preserved verbatim.
    const scheduledTime = editScheduledTime || undefined;
    onEditTask(task.id, {
      title: trimmedTitle,
      priority: editPriority,
      dueDate: editDueDate || undefined,
      estimatedMinutes: parseMinutes(editEstimatedMinutes),
      scheduledTime,
      durationMinutes: scheduledTime ? parseMinutes(editDurationMinutes) : undefined,
      goalId: task.goalId,
      projectId: editProjectId || undefined,
      milestoneId: editMilestoneId || undefined,
    });
    setEditingTaskId(null);
  }

  const visibleTasks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = tasks.filter((task) => {
      if (statusFilter === "open" && task.completed) return false;
      if (statusFilter === "completed" && !task.completed) return false;
      if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
      if (projectFilter !== "" && task.projectId !== projectFilter) return false;
      if (needle !== "" && !task.title.toLowerCase().includes(needle)) return false;
      return true;
    });
    // Overdue first, then due date, then priority, then creation order.
    return [...filtered].sort((a, b) => {
      const aOverdue = a.dueDate !== undefined && a.dueDate < todayKey && !a.completed ? 0 : 1;
      const bOverdue = b.dueDate !== undefined && b.dueDate < todayKey && !b.completed ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      const aDue = a.dueDate ?? "\uffff";
      const bDue = b.dueDate ?? "\uffff";
      if (aDue !== bDue) return aDue < bDue ? -1 : 1;
      const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (byPriority !== 0) return byPriority;
      return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    });
  }, [tasks, statusFilter, priorityFilter, projectFilter, query, todayKey]);

  const groups = useMemo(() => {
    const overdue: Task[] = [];
    const upcoming: Task[] = [];
    const backlog: Task[] = [];
    const done: Task[] = [];
    for (const task of visibleTasks) {
      if (task.completed) {
        done.push(task);
        continue;
      }
      if (task.dueDate !== undefined && task.dueDate < todayKey) {
        overdue.push(task);
        continue;
      }
      if (task.dueDate !== undefined) {
        upcoming.push(task);
        continue;
      }
      backlog.push(task);
    }
    const ordered: { key: string; label: string; hint: string; items: Task[] }[] = [];
    if (overdue.length > 0) ordered.push({ key: "overdue", label: "Overdue", hint: "Needs attention first", items: overdue });
    if (upcoming.length > 0) ordered.push({ key: "upcoming", label: "Scheduled", hint: "Dated work in order", items: upcoming });
    if (backlog.length > 0) ordered.push({ key: "backlog", label: "Backlog", hint: "No due date yet", items: backlog });
    if (done.length > 0) ordered.push({ key: "done", label: "Completed", hint: "Finished work", items: done });
    return ordered;
  }, [visibleTasks, todayKey]);

  function renderContext(task: Task) {
    const { project, milestone } = resolveTaskContext(task, { projects, milestones });
    const parts = [project?.name, milestone?.title].filter(
      (part): part is string => part !== undefined && part !== "",
    );
    if (parts.length === 0) return null;
    return (
      <span style={{ color: "var(--text-muted)", fontSize: "var(--type-xs)" }}>
        {parts.join("  ·  ")}
      </span>
    );
  }

  function dueLabel(task: Task, overdue: boolean, stale: boolean): string {
    if (!task.dueDate) return "";
    if (stale) return `Backlog since ${formatFullDate(task.dueDate)}`;
    if (overdue) return `Overdue · due ${formatFullDate(task.dueDate)}`;
    return `Due ${formatFullDate(task.dueDate)}`;
  }

  function renderRow(task: Task) {
    const overdue = !task.completed && task.dueDate !== undefined && task.dueDate < todayKey;
    // Abandoned work stays visible and actionable, but stops shouting:
    // stale backlog renders quiet instead of alarming red.
    const stale = !task.completed && isTaskStaleBacklog(task, todayKey);

    if (editingTaskId === task.id) {
      return (
        <li key={task.id} className="row-item" style={{ alignItems: "stretch" }}>
          <form style={{ display: "grid", flex: 1, minWidth: 0, gap: "var(--space-2)" }} onSubmit={(event) => handleEditSubmit(event, task)}>
            <input
              autoFocus
              required
              maxLength={120}
              className="form-control"
              value={editTitle}
              onChange={(event) => setEditTitle(event.target.value)}
              aria-label="Task Title"
            />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: "var(--space-2)" }}>
              <select
                className="form-control"
                style={selectStyle}
                value={editProjectId}
                onChange={(event) => setEditProjectId(event.target.value)}
                aria-label="Linked Project (Optional)"
              >
                <option value="">No Project</option>
                {projects
                  .filter((project) => project.status !== "archived")
                  .map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
              </select>
              <select
                className="form-control"
                style={selectStyle}
                value={editMilestoneId}
                onChange={(event) => setEditMilestoneId(event.target.value)}
                aria-label="Linked Milestone (Optional)"
              >
                <option value="">No Milestone</option>
                {milestones
                  .filter((milestone) => {
                    if (editProjectId !== "") return milestone.projectId === editProjectId;
                    return true;
                  })
                  .map((milestone) => (
                    <option key={milestone.id} value={milestone.id}>{milestone.title}</option>
                  ))}
              </select>
              <input
                type="date"
                className="form-control"
                value={editDueDate}
                onChange={(event) => setEditDueDate(event.target.value)}
                aria-label="Task Due Date"
              />
              <input
                type="number"
                min={1}
                step={1}
                className="form-control"
                value={editEstimatedMinutes}
                onChange={(event) => setEditEstimatedMinutes(event.target.value)}
                placeholder="Minutes"
                aria-label="Estimated Minutes"
              />
              <input
                type="time"
                className="form-control"
                value={editScheduledTime}
                onChange={(event) => setEditScheduledTime(event.target.value)}
                aria-label="Scheduled Time"
              />
              <input
                type="number"
                min={1}
                step={1}
                className="form-control"
                value={editDurationMinutes}
                onChange={(event) => setEditDurationMinutes(event.target.value)}
                placeholder="Minutes"
                aria-label="Duration in Minutes"
              />
              <select
                className="form-control"
                style={selectStyle}
                value={editPriority}
                onChange={(event) => setEditPriority(event.target.value as Task["priority"])}
                aria-label="Task Priority"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
              <button type="button" className="ui-button ui-button--sm" onClick={() => setEditingTaskId(null)}>
                Cancel
              </button>
              <button type="submit" className="ui-button ui-button--sm ui-button--primary">Save</button>
            </div>
          </form>
        </li>
      );
    }

    return (
      <li key={task.id} className="row-item">
        <button
          type="button"
          className="ring-check"
          onClick={() => onToggleTask(task.id)}
          aria-pressed={task.completed}
          aria-label={`${task.completed ? "Mark incomplete" : "Complete"} "${task.title}"`}
        >
          {task.completed && <Check size={14} />}
        </button>
        <button
          type="button"
          onClick={() => onToggleTask(task.id)}
          aria-label={`${task.completed ? "Mark incomplete" : "Complete"} "${task.title}"`}
          style={{
            display: "grid",
            flex: 1,
            minWidth: 0,
            gap: 3,
            padding: 0,
            border: "none",
            background: "transparent",
            color: "var(--text-body)",
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span
              aria-hidden="true"
              style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: PRIORITY_DOT[task.priority] }}
            />
            <span className="truncate-1" style={{ textDecoration: task.completed ? "line-through" : "none", color: task.completed ? "var(--text-muted)" : "var(--text-primary)", fontWeight: 600 }}>
              {task.title}
            </span>
          </span>
          <span style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, color: "var(--text-muted)", fontSize: "var(--type-xs)" }}>
            <span className={PRIORITY_BADGE_CLASS[task.priority]}>{task.priority}</span>
            {task.dueDate && (
              <time
                dateTime={task.dueDate}
                style={overdue && !stale ? { color: "var(--color-danger)", fontWeight: 700 } : undefined}
              >
                {dueLabel(task, overdue, stale)}
              </time>
            )}
            {task.scheduledTime && <span>Scheduled {task.scheduledTime}</span>}
            {(task.durationMinutes ?? task.estimatedMinutes) !== undefined && (
              <span>{task.durationMinutes ?? task.estimatedMinutes} min</span>
            )}
            {renderContext(task)}
          </span>
        </button>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
          <button
            type="button"
            className="ui-button ui-button--ghost ui-button--sm"
            style={{ minHeight: 30, padding: "4px 8px" }}
            onClick={() => onStartFocus({ taskId: task.id, title: task.title })}
            aria-label={`Start focus on "${task.title}"`}
            title="Start Focus"
          >
            <Play size={14} />
          </button>
          <button
            type="button"
            className="ui-button ui-button--ghost ui-button--sm"
            style={{ minHeight: 30, padding: "4px 8px" }}
            onClick={() => beginEdit(task)}
            aria-label={`Edit "${task.title}"`}
            title="Edit Task"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            className="ui-button ui-button--ghost ui-button--sm"
            style={{ minHeight: 30, padding: "4px 8px" }}
            onClick={() => setPendingDeletion(task)}
            aria-label={`Delete "${task.title}"`}
            title="Delete Task"
          >
            <Trash2 size={14} />
          </button>
        </span>
      </li>
    );
  }

  const isFiltering = statusFilter !== "all" || priorityFilter !== "all" || projectFilter !== "" || query.trim() !== "";

  return (
    <section aria-labelledby="tasks-title">
      <header className="page-head">
        <h1 id="tasks-title">Tasks</h1>
        <p>{openCount} open · {completedCount} completed · Small steps count.</p>
      </header>

      <div className="page-toolbar" role="group" aria-label="Filter Tasks">
        <span style={{ position: "relative", display: "inline-flex", alignItems: "center", flex: "1 1 180px", minWidth: 160 }}>
          <Search size={14} aria-hidden="true" style={{ position: "absolute", left: 10, color: "var(--text-muted)" }} />
          <input
            className="form-control"
            style={{ width: "100%", paddingLeft: 30 }}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks"
            aria-label="Search tasks"
          />
        </span>
        <div role="group" aria-label="Completion Status" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {(["open", "completed", "all"] as StatusFilter[]).map((status) => (
            <button
              key={status}
              type="button"
              className={`ui-button ui-button--sm ${statusFilter === status ? "ui-button--primary" : "ui-button--ghost"}`}
              onClick={() => setStatusFilter(status)}
              aria-pressed={statusFilter === status}
            >
              {status === "open" ? `Open (${openCount})` : status === "completed" ? `Completed (${completedCount})` : `All (${tasks.length})`}
            </button>
          ))}
        </div>
        <select
          className="form-control"
          style={{ ...selectStyle, width: "auto" }}
          value={priorityFilter}
          onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}
          aria-label="Filter by Priority"
        >
          <option value="all">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          className="form-control"
          style={{ ...selectStyle, width: "auto", maxWidth: 220 }}
          value={projectFilter}
          onChange={(event) => setProjectFilter(event.target.value)}
          aria-label="Filter by Project"
        >
          <option value="">All Projects</option>
          {projects.filter((project) => project.status !== "archived").map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
      </div>

      <form className="atelier-group" style={{ padding: 16, marginBottom: 16 }} onSubmit={handleAddSubmit} aria-label="Add a Task">
        <div style={{ display: "flex", gap: 8 }}>
          <input
            required
            maxLength={120}
            className="form-control"
            style={{ flex: 1, minWidth: 0 }}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Add a task"
            aria-label="Task Title"
          />
          <button type="submit" className="ui-button ui-button--primary ui-button--sm">
            <Plus size={14} />
            <span>Add</span>
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 8, marginTop: 10 }}>
          <label style={{ display: "grid", gap: 5, color: "var(--text-secondary)", fontSize: "var(--type-xs)", fontWeight: 600 }}>
            Priority
            <select
              className="form-control"
              style={selectStyle}
              value={priority}
              onChange={(event) => setPriority(event.target.value as Task["priority"])}
              aria-label="Priority"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 5, color: "var(--text-secondary)", fontSize: "var(--type-xs)", fontWeight: 600 }}>
            Due Date
            <input
              type="date"
              className="form-control"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              aria-label="Due Date"
            />
          </label>
          <label style={{ display: "grid", gap: 5, color: "var(--text-secondary)", fontSize: "var(--type-xs)", fontWeight: 600 }}>
            Estimate (min)
            <input
              type="number"
              min={1}
              step={1}
              className="form-control"
              value={estimatedMinutes}
              onChange={(event) => setEstimatedMinutes(event.target.value)}
              placeholder="Minutes"
              aria-label="Estimated Minutes"
            />
          </label>
          <label style={{ display: "grid", gap: 5, color: "var(--text-secondary)", fontSize: "var(--type-xs)", fontWeight: 600 }}>
            Project
            <select
              className="form-control"
              style={selectStyle}
              value={projectId}
              onChange={(event) => { setProjectId(event.target.value); setMilestoneId(""); }}
              aria-label="Linked Project (Optional)"
            >
              <option value="">No Project</option>
              {availableProjects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 5, color: "var(--text-secondary)", fontSize: "var(--type-xs)", fontWeight: 600 }}>
            Milestone
            <select
              className="form-control"
              style={selectStyle}
              value={milestoneId}
              onChange={(event) => setMilestoneId(event.target.value)}
              aria-label="Linked Milestone (Optional)"
            >
              <option value="">No Milestone</option>
              {availableMilestones.map((milestone) => (
                <option key={milestone.id} value={milestone.id}>{milestone.title}</option>
              ))}
            </select>
          </label>
        </div>
      </form>

      {visibleTasks.length === 0 ? (
        <div className="atelier-group ui-empty-state">
          <strong>{tasks.length === 0 ? "No tasks yet" : "No tasks match your filter"}</strong>
          <span className="atelier-sub">
            {tasks.length === 0
              ? "Add your first task above — just a title is enough to get started"
              : "Try a different search, status, or priority filter"}
          </span>
          {isFiltering && tasks.length > 0 && (
            <button
              type="button"
              className="ui-button ui-button--sm"
              onClick={() => { setQuery(""); setStatusFilter("open"); setPriorityFilter("all"); setProjectFilter(""); }}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {groups.map((group) => (
            <section key={group.key} aria-label={group.label}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, margin: "0 2px 8px" }}>
                <h2 className="section-eyebrow">{group.label} · {group.items.length}</h2>
                <span style={{ color: "var(--text-muted)", fontSize: "var(--type-xs)" }}>{group.hint}</span>
              </div>
              <ul className="atelier-group" style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {group.items.map((task) => renderRow(task))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {pendingDeletion && (
        <div className="modal-overlay" role="presentation" onClick={() => setPendingDeletion(null)}>
          <div
            className="delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tasks-delete-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="tasks-delete-modal-title">Delete "{pendingDeletion.title}"?</h2>
            <p>This action cannot be undone. Its project, milestone, and focus history are left untouched.</p>
            <div className="delete-modal-actions">
              <button
                type="button"
                className="delete-modal-cancel"
                onClick={() => setPendingDeletion(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="delete-modal-confirm"
                onClick={() => {
                  onDeleteTask(pendingDeletion.id);
                  if (editingTaskId === pendingDeletion.id) setEditingTaskId(null);
                  setPendingDeletion(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
