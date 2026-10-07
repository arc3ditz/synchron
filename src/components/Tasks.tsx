import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { Check, Pencil, Play, Plus, Trash2 } from "lucide-react";

import { CARD_SURFACE } from "../theme";
import type { Goal, Milestone, Project, Task } from "../types";
import { resolveTaskContext } from "../domain/tasks";
import { getTodayKey } from "../utils/dates";
import { formatFullDate } from "../utils/dates";

type TasksProps = {
  tasks: Task[];
  goals: Goal[];
  milestones: Milestone[];
  projects?: Project[];
  dayResetHour: number;
  onAddTask: (data: Omit<Task, "id" | "createdAt" | "completed">) => void;
  onEditTask: (taskId: string, data: Omit<Task, "id" | "createdAt" | "completed">) => void;
  onDeleteTask: (taskId: string) => void;
  onToggleTask: (taskId: string) => void;
  onStartFocus: (entityId?: { taskId?: string; habitId?: number; goalId?: string; title?: string }) => void;
};

type StatusFilter = "open" | "completed" | "all";

const priorityStyles: Record<Task["priority"], CSSProperties> = {
  high: {
    color: "var(--priority-high-text)",
    background: "var(--priority-high-bg)",
    border: "1px solid var(--priority-high-border)",
  },
  medium: {
    color: "var(--priority-medium-text)",
    background: "var(--priority-medium-bg)",
    border: "1px solid var(--priority-medium-border)",
  },
  low: {
    color: "var(--priority-low-text)",
    background: "var(--priority-low-bg)",
    border: "1px solid var(--priority-low-border)",
  },
};

const PRIORITY_RANK: Record<Task["priority"], number> = { high: 0, medium: 1, low: 2 };

const styles: Record<string, CSSProperties> = {
  page: {
    width: "100%",
    maxWidth: "100%",
    marginInline: "auto",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "var(--space-4)",
    marginBottom: "var(--space-2)",
  },
  title: {
    margin: 0,
    color: "var(--text-primary)",
    fontSize: "var(--type-xl)",
    fontWeight: "var(--font-semibold)",
  },
  subtitle: {
    margin: "0 0 var(--space-5)",
    color: "var(--text-secondary)",
    fontSize: 13,
  },
  form: {
    ...CARD_SURFACE,
    display: "grid",
    gap: "var(--space-3)",
    marginBottom: "var(--space-4)",
  },
  input: {
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    padding: "10px 14px",
    border: "1px solid var(--card-surface-border)",
    borderRadius: 8,
    background: "var(--card-surface-bg)",
    color: "var(--text-primary)",
    fontSize: 14,
  },
  compactInput: {
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    padding: "7px 9px",
    border: "1px solid var(--card-surface-border)",
    borderRadius: 7,
    background: "var(--card-surface-bg)",
    color: "var(--text-primary)",
    fontSize: 12,
  },
  addRow: {
    display: "flex",
    gap: 8,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))",
    gap: 8,
  },
  fieldLabel: {
    display: "grid",
    gap: 5,
    color: "var(--text-secondary)",
    fontSize: 12,
  },
  formActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
  },
  secondaryButton: {
    padding: "8px 12px",
    border: "1px solid var(--card-surface-border)",
    borderRadius: 8,
    background: "transparent",
    color: "var(--text-body)",
    fontSize: 13,
    cursor: "pointer",
  },
  submitButton: {
    padding: "8px 12px",
    border: "1px solid var(--accent-border)",
    borderRadius: 8,
    background: "var(--accent-teal)",
    color: "var(--bg-primary)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  filterRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: "var(--space-4)",
  },
  filterSegment: {
    display: "inline-flex",
    gap: "var(--space-1)",
    padding: "var(--space-1)",
    background: "var(--bg-inset)",
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--radius-md)",
  },
  filterButton: {
    padding: "6px 12px",
    background: "transparent",
    border: "none",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-secondary)",
    fontSize: 13,
    cursor: "pointer",
  },
  filterButtonActive: {
    background: "var(--color-surface)",
    color: "var(--color-accent)",
  },
  goalFilter: {
    minWidth: 160,
    maxWidth: 260,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "var(--space-2) 0",
    borderBottom: "1px solid var(--border-color)",
  },
  taskButton: {
    display: "flex",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    gap: 9,
    padding: "8px 12px",
    border: "1px solid transparent",
    borderRadius: 8,
    background: "transparent",
    color: "var(--text-body)",
    textAlign: "left",
    cursor: "pointer",
  },
  taskDetails: {
    display: "grid",
    minWidth: 0,
    gap: 4,
  },
  taskMetadata: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    color: "var(--text-muted)",
    fontSize: 11,
  },
  priorityBadge: {
    padding: "1px 6px",
    fontSize: 10,
    fontWeight: 600,
    textTransform: "capitalize",
  },
  overdue: {
    color: "var(--priority-high-text)",
    fontWeight: 600,
  },
  context: {
    color: "var(--text-muted)",
  },
  taskCheck: {
    display: "grid",
    placeItems: "center",
    width: 20,
    height: 20,
    flex: "0 0 20px",
    border: "1px solid var(--checkbox-border)",
    borderRadius: 6,
    background: "transparent",
    color: "var(--color-accent-contrast)",
  },
  taskCheckCompleted: {
    background: "var(--checkbox-checked-bg)",
    border: "1px solid var(--checkbox-checked-border)",
    boxShadow: "var(--checkbox-checked-shadow)",
  },
  iconButton: {
    display: "grid",
    placeItems: "center",
    width: 30,
    height: 30,
    padding: 0,
    border: "1px solid var(--card-surface-border)",
    borderRadius: 7,
    background: "transparent",
    color: "var(--text-secondary)",
    cursor: "pointer",
    flexShrink: 0,
  },
  focusButton: {
    display: "grid",
    placeItems: "center",
    width: 30,
    height: 30,
    padding: 0,
    background: "transparent",
    border: "1px solid transparent",
    borderRadius: 7,
    color: "var(--text-muted)",
    cursor: "pointer",
    flexShrink: 0,
  },
  editForm: {
    display: "grid",
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  empty: {
    padding: "28px 16px",
    color: "var(--text-secondary)",
    fontSize: 13,
    textAlign: "center",
  },
};

export default function Tasks({
  tasks,
  goals,
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
  const [goalId, setGoalId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [milestoneId, setMilestoneId] = useState("");

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editPriority, setEditPriority] = useState<Task["priority"]>("medium");
  const [editDueDate, setEditDueDate] = useState("");
  const [editEstimatedMinutes, setEditEstimatedMinutes] = useState("");
  const [editGoalId, setEditGoalId] = useState("");
  const [editProjectId, setEditProjectId] = useState("");
  const [editMilestoneId, setEditMilestoneId] = useState("");

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [goalFilter, setGoalFilter] = useState("");
  const [pendingDeletion, setPendingDeletion] = useState<Task | null>(null);

  const activeGoals = goals.filter((goal) => goal.status !== "archived");
  const openCount = tasks.filter((task) => !task.completed).length;
  const completedCount = tasks.length - openCount;

  const availableProjects = useMemo(() => {
    const list = projects.filter((project) =>
      project.status !== "archived" && (goalId === "" || project.goalId === undefined || project.goalId === goalId),
    );
    if (projectId !== "" && !list.some((project) => project.id === projectId)) {
      const current = projects.find((project) => project.id === projectId);
      return current ? [...list, current] : list;
    }
    return list;
  }, [projects, goalId, projectId]);

  const availableMilestones = useMemo(() => {
    const list = milestones.filter((milestone) => {
      if (projectId !== "") {
        return milestone.projectId === projectId ||
          (milestone.goalId !== undefined && milestone.goalId === goalId && milestone.projectId === undefined);
      }
      if (goalId !== "") return milestone.goalId === goalId;
      return true;
    });
    if (milestoneId !== "" && !list.some((milestone) => milestone.id === milestoneId)) {
      const current = milestones.find((milestone) => milestone.id === milestoneId);
      return current ? [...list, current] : list;
    }
    return list;
  }, [milestones, goalId, projectId, milestoneId]);

  function resetAddForm() {
    setTitle("");
    setPriority("medium");
    setDueDate("");
    setEstimatedMinutes("");
    setGoalId("");
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
      goalId: goalId || undefined,
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
    setEditGoalId(task.goalId ?? "");
    setEditProjectId(task.projectId ?? "");
    setEditMilestoneId(task.milestoneId ?? "");
  }

  function handleEditSubmit(event: FormEvent<HTMLFormElement>, task: Task) {
    event.preventDefault();
    const trimmedTitle = editTitle.trim();
    if (!trimmedTitle) return;

    onEditTask(task.id, {
      title: trimmedTitle,
      priority: editPriority,
      dueDate: editDueDate || undefined,
      estimatedMinutes: parseMinutes(editEstimatedMinutes),
      goalId: editGoalId || undefined,
      projectId: editProjectId || undefined,
      milestoneId: editMilestoneId || undefined,
    });
    setEditingTaskId(null);
  }

  const visibleTasks = useMemo(() => {
    const filtered = tasks.filter((task) => {
      if (statusFilter === "open" && task.completed) return false;
      if (statusFilter === "completed" && !task.completed) return false;
      if (goalFilter !== "") {
        const { goal } = resolveTaskContext(task, { goals, projects, milestones });
        if ((goal?.id ?? task.goalId) !== goalFilter) return false;
      }
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
  }, [tasks, statusFilter, goalFilter, goals, projects, milestones, todayKey]);

  function renderContext(task: Task) {
    const { goal, project, milestone } = resolveTaskContext(task, { goals, projects, milestones });
    const parts = [goal?.title, project?.name, milestone?.title].filter(
      (part): part is string => part !== undefined && part !== "",
    );
    if (parts.length === 0) return null;
    return <span style={styles.context}>{parts.join(" › ")}</span>;
  }

  function renderRow(task: Task) {
    const overdue = !task.completed && task.dueDate !== undefined && task.dueDate < todayKey;

    if (editingTaskId === task.id) {
      return (
        <li key={task.id} style={styles.row}>
          <form style={styles.editForm} onSubmit={(event) => handleEditSubmit(event, task)}>
            <input
              autoFocus
              required
              maxLength={120}
              style={styles.compactInput}
              value={editTitle}
              onChange={(event) => setEditTitle(event.target.value)}
              aria-label="Task title"
            />
            <div style={styles.formGrid}>
              <select
                style={styles.compactInput}
                value={editGoalId}
                onChange={(event) => setEditGoalId(event.target.value)}
                aria-label="Linked goal (optional)"
              >
                <option value="">No goal</option>
                {activeGoals.map((goal) => (
                  <option key={goal.id} value={goal.id}>{goal.title}</option>
                ))}
              </select>
              <select
                style={styles.compactInput}
                value={editProjectId}
                onChange={(event) => setEditProjectId(event.target.value)}
                aria-label="Linked project (optional)"
              >
                <option value="">No project</option>
                {projects
                  .filter((project) =>
                    project.status !== "archived" &&
                    (editGoalId === "" || project.goalId === undefined || project.goalId === editGoalId))
                  .map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
              </select>
              <select
                style={styles.compactInput}
                value={editMilestoneId}
                onChange={(event) => setEditMilestoneId(event.target.value)}
                aria-label="Linked milestone (optional)"
              >
                <option value="">No milestone</option>
                {milestones
                  .filter((milestone) => {
                    if (editProjectId !== "") return milestone.projectId === editProjectId;
                    if (editGoalId !== "") return milestone.goalId === editGoalId;
                    return true;
                  })
                  .map((milestone) => (
                    <option key={milestone.id} value={milestone.id}>{milestone.title}</option>
                  ))}
              </select>
              <input
                type="date"
                style={styles.compactInput}
                value={editDueDate}
                onChange={(event) => setEditDueDate(event.target.value)}
                aria-label="Task due date"
              />
              <input
                type="number"
                min={1}
                step={1}
                style={styles.compactInput}
                value={editEstimatedMinutes}
                onChange={(event) => setEditEstimatedMinutes(event.target.value)}
                placeholder="Minutes"
                aria-label="Estimated minutes"
              />
              <select
                style={styles.compactInput}
                value={editPriority}
                onChange={(event) => setEditPriority(event.target.value as Task["priority"])}
                aria-label="Task priority"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div style={styles.formActions}>
              <button type="button" style={styles.secondaryButton} onClick={() => setEditingTaskId(null)}>
                Cancel
              </button>
              <button type="submit" style={styles.submitButton}>Save</button>
            </div>
          </form>
        </li>
      );
    }

    return (
      <li key={task.id} style={styles.row}>
        <button
          type="button"
          style={styles.taskButton}
          onClick={() => onToggleTask(task.id)}
          aria-pressed={task.completed}
          aria-label={`${task.completed ? "Mark incomplete" : "Complete"} "${task.title}"`}
        >
          <span style={{ ...styles.taskCheck, ...(task.completed ? styles.taskCheckCompleted : {}) }}>
            {task.completed && <Check size={13} />}
          </span>
          <span style={styles.taskDetails}>
            <span style={{
              overflowWrap: "anywhere",
              textDecoration: task.completed ? "line-through" : "none",
            }}>
              {task.title}
            </span>
            <span style={styles.taskMetadata}>
              <span style={{ ...styles.priorityBadge, ...priorityStyles[task.priority] }}>
                {task.priority}
              </span>
              {task.dueDate && (
                <time dateTime={task.dueDate} style={overdue ? styles.overdue : undefined}>
                  {overdue ? `Overdue (due ${formatFullDate(task.dueDate)})` : `Due ${formatFullDate(task.dueDate)}`}
                </time>
              )}
              {task.estimatedMinutes !== undefined && <span>{task.estimatedMinutes} min</span>}
              {renderContext(task)}
            </span>
          </span>
        </button>
        <button
          type="button"
          style={styles.focusButton}
          onClick={() => onStartFocus({ taskId: task.id, title: task.title })}
          aria-label={`Start focus on "${task.title}"`}
          title="Start focus"
        >
          <Play size={14} />
        </button>
        <button
          type="button"
          style={styles.iconButton}
          onClick={() => beginEdit(task)}
          aria-label={`Edit "${task.title}"`}
          title="Edit task"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          style={styles.iconButton}
          onClick={() => setPendingDeletion(task)}
          aria-label={`Delete "${task.title}"`}
          title="Delete task"
        >
          <Trash2 size={14} />
        </button>
      </li>
    );
  }

  return (
    <section style={styles.page} aria-labelledby="tasks-title">
      <header style={styles.header}>
        <h1 id="tasks-title" style={styles.title}>Tasks</h1>
      </header>
      <p style={styles.subtitle}>Small steps count.</p>

      <form style={styles.form} onSubmit={handleAddSubmit} aria-label="Add a task">
        <div style={styles.addRow}>
          <input
            required
            maxLength={120}
            style={styles.input}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Add a Task"
            aria-label="Task title"
          />
          <button type="submit" style={styles.submitButton}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Plus size={14} />
              <span>Add</span>
            </span>
          </button>
        </div>
        <div style={styles.formGrid}>
          <label style={styles.fieldLabel}>
            Priority
            <select
              style={styles.compactInput}
              value={priority}
              onChange={(event) => setPriority(event.target.value as Task["priority"])}
              aria-label="Priority"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label style={styles.fieldLabel}>
            Due date
            <input
              type="date"
              style={styles.compactInput}
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              aria-label="Due date"
            />
          </label>
          <label style={styles.fieldLabel}>
            Estimate (min)
            <input
              type="number"
              min={1}
              step={1}
              style={styles.compactInput}
              value={estimatedMinutes}
              onChange={(event) => setEstimatedMinutes(event.target.value)}
              placeholder="Minutes"
              aria-label="Estimated minutes"
            />
          </label>
          <label style={styles.fieldLabel}>
            Goal
            <select
              style={styles.compactInput}
              value={goalId}
              onChange={(event) => { setGoalId(event.target.value); setProjectId(""); setMilestoneId(""); }}
              aria-label="Linked goal (optional)"
            >
              <option value="">No goal</option>
              {activeGoals.map((goal) => (
                <option key={goal.id} value={goal.id}>{goal.title}</option>
              ))}
            </select>
          </label>
          <label style={styles.fieldLabel}>
            Project
            <select
              style={styles.compactInput}
              value={projectId}
              onChange={(event) => { setProjectId(event.target.value); setMilestoneId(""); }}
              aria-label="Linked project (optional)"
            >
              <option value="">No project</option>
              {availableProjects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </label>
          <label style={styles.fieldLabel}>
            Milestone
            <select
              style={styles.compactInput}
              value={milestoneId}
              onChange={(event) => setMilestoneId(event.target.value)}
              aria-label="Linked milestone (optional)"
            >
              <option value="">No milestone</option>
              {availableMilestones.map((milestone) => (
                <option key={milestone.id} value={milestone.id}>{milestone.title}</option>
              ))}
            </select>
          </label>
        </div>
      </form>

      <div style={styles.filterRow} role="group" aria-label="Filter tasks">
        <div style={styles.filterSegment} role="group" aria-label="Completion status">
          {(["open", "completed", "all"] as StatusFilter[]).map((status) => (
            <button
              key={status}
              type="button"
              style={{ ...styles.filterButton, ...(statusFilter === status ? styles.filterButtonActive : {}) }}
              onClick={() => setStatusFilter(status)}
              aria-pressed={statusFilter === status}
            >
              {status === "open" ? `Open (${openCount})` : status === "completed" ? `Completed (${completedCount})` : `All (${tasks.length})`}
            </button>
          ))}
        </div>
        <select
          style={{ ...styles.compactInput, ...styles.goalFilter }}
          value={goalFilter}
          onChange={(event) => setGoalFilter(event.target.value)}
          aria-label="Filter by goal"
        >
          <option value="">All goals</option>
          {activeGoals.map((goal) => (
            <option key={goal.id} value={goal.id}>{goal.title}</option>
          ))}
        </select>
      </div>

      {visibleTasks.length === 0 ? (
        <p style={styles.empty}>
          {tasks.length === 0
            ? "No tasks yet — add your first one above."
            : "Nothing here. Try a different filter."}
        </p>
      ) : (
        <ul style={styles.list}>
          {visibleTasks.map((task) => renderRow(task))}
        </ul>
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
            <p>This action cannot be undone. Its goal, project, milestone, and focus history are left untouched.</p>
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
