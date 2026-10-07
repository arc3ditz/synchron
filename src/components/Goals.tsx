import { useState, type CSSProperties, type FormEvent } from "react";
import { Archive, ArchiveRestore, Check, ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";

import { CARD_SURFACE } from "../theme";
import type { FocusSessionRecord, Goal, Habit, Milestone, Project, Task } from "../types";
import { calculateProjectProgress } from "../domain/projects";
import { calculateGoalProgress, selectGoalWork } from "../domain/goals";
import { calculateStreak, formatFullDate } from "../utils/dates";
import StreakBadge from "./StreakBadge";

type GoalsProps = {
  goals: Goal[];
  tasks: Task[];
  habits: Habit[];
  focusSessions: FocusSessionRecord[];
  streakFreeze: boolean;
  dayResetHour: number;
  milestones?: Milestone[];
  onAddGoal: (data: Omit<Goal, "id" | "createdAt" | "status">) => void;
  onToggleGoalArchive: (goalId: string) => void;
  onEditGoal: (goalId: string, data: Omit<Goal, "id" | "createdAt" | "status">) => void;
  onDeleteGoal: (goalId: string) => void;
  onAddMilestone: (data: Omit<Milestone, "id" | "completed">) => void;
  onEditMilestone: (milestoneId: string, data: Omit<Milestone, "id" | "completed">) => void;
  onDeleteMilestone: (milestoneId: string) => void;
  onToggleMilestone: (goalId: string, milestoneId: string) => void;
  projects?: Project[];
  onOpenProject: (projectId: string) => void;
  onAddProject: (data: Omit<Project, "id" | "createdAt" | "status">) => void;
};

type PendingDeletion = {
  type: "goal" | "milestone";
  id: string;
  goalId?: string;
  title: string;
};

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
    marginBottom: "var(--space-6)",
  },
  title: {
    margin: 0,
    color: "var(--text-primary)",
    fontSize: "var(--type-xl)",
    fontWeight: "var(--font-semibold)",
  },
  addButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--space-2)",
    flexShrink: 0,
    padding: "var(--space-2) var(--space-3)",
    border: "1px solid var(--accent-border)",
    borderRadius: "var(--radius-md)",
    background: "var(--accent-wash)",
    color: "var(--color-accent)",
    fontSize: "var(--type-sm)",
    fontWeight: "var(--font-semibold)",
    cursor: "pointer",
  },
  form: {
    ...CARD_SURFACE,
    display: "grid",
    gap: "var(--space-3)",
    marginBottom: "var(--space-4)",
  },
  formTitle: {
    margin: 0,
    color: "var(--text-primary)",
    fontSize: 16,
    fontWeight: 600,
  },
  input: {
    width: "100%",
    minWidth: 0,
    padding: "10px 14px",
    border: "1px solid var(--card-surface-border)",
    borderRadius: 8,
    background: "var(--card-surface-bg)",
    color: "var(--text-primary)",
    fontSize: 14,
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
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 500px), 1fr))",
    gap: "var(--space-3)",
  },
  card: {
    ...CARD_SURFACE,
    width: "100%",
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-4)",
    padding: "var(--space-4)",
  },
  archivedSection: {
    display: "grid",
    gap: 12,
    marginTop: 24,
  },
  archivedToggle: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    width: "100%",
    padding: "10px 12px",
    border: "1px solid var(--card-surface-border)",
    borderRadius: 8,
    background: "var(--card-surface-bg)",
    color: "var(--text-secondary)",
    fontSize: 13,
    fontWeight: 600,
    textAlign: "left",
    cursor: "pointer",
  },
  archivedList: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 500px), 1fr))",
    gap: 12,
  },
  archivedGoalDescription: {
    margin: 0,
    color: "var(--text-secondary)",
    fontSize: 13,
    overflowWrap: "anywhere",
  },
  projectOpenButton: {
    minWidth: 0,
    padding: 0,
    border: "none",
    background: "transparent",
    color: "var(--text-primary)",
    fontSize: 13,
    fontWeight: 500,
    textAlign: "left",
    overflowWrap: "anywhere",
    cursor: "pointer",
  },
  projectRowMeta: {
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
    gap: 8,
  },
  projectProgressTrack: {
    width: 56,
    height: 6,
    borderRadius: 3,
    background: "var(--bg-inset)",
    overflow: "hidden",
  },
  cardHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  cardActions: {
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
    gap: 6,
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
  },
  goalTitle: {
    margin: 0,
    color: "var(--text-primary)",
    fontSize: 17,
    fontWeight: 600,
    overflowWrap: "anywhere",
  },
  status: {
    flexShrink: 0,
    padding: "3px 8px",
    border: "1px solid var(--border-strong)",
    borderRadius: 12,
    color: "var(--text-secondary)",
    fontSize: 10,
    textTransform: "capitalize",
  },
  description: {
    margin: "10px 0 0",
    color: "var(--text-secondary)",
    fontSize: 13,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
  meta: {
    margin: "12px 0 0",
    color: "var(--text-muted)",
    fontSize: 12,
  },
  progressTrack: {
    width: "100%",
    height: "var(--space-1)",
    marginTop: "var(--space-3)",
    borderRadius: "var(--radius-sm)",
    background: "var(--bg-inset)",
    overflow: "hidden",
    display: "flex",
  },
  progressFill: {
    height: "100%",
    background: "var(--color-accent)",
  },
  progressSegments: {
    height: "100%",
    display: "flex",
    width: "100%",
  },
  progressSegmentTask: {
    height: "100%",
    background: "var(--color-accent)",
  },
  progressSegmentMilestone: {
    height: "100%",
    background: "var(--color-accent-soft)",
  },
  progressSegmentHabit: {
    height: "100%",
    background: "var(--color-success)",
  },
  progressLegend: {
    display: "flex",
    gap: 12,
    marginTop: 8,
    fontSize: 11,
    color: "var(--text-muted)",
  },
  progressLegendItem: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  progressLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  progressLegendDotTask: {
    background: "var(--color-accent)",
  },
  progressLegendDotMilestone: {
    background: "var(--color-accent-soft)",
  },
  progressLegendDotHabit: {
    background: "var(--color-success)",
  },
  linkedHabits: {
    width: "100%",
    display: "grid",
    gap: 7,
    marginTop: 0,
    paddingTop: 16,
    borderTop: "1px solid var(--border-color)",
  },
  linkedHabitsTitle: {
    margin: 0,
    color: "var(--text-secondary)",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
  },
  linkedHabitRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    color: "var(--text-body)",
    fontSize: 13,
  },
  linkedHabitName: {
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  goalEditForm: {
    display: "grid",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTop: "1px solid var(--border-color)",
  },
  compactInput: {
    width: "100%",
    minWidth: 0,
    padding: "10px 14px",
    border: "1px solid var(--card-surface-border)",
    borderRadius: 8,
    background: "var(--card-surface-bg)",
    color: "var(--text-primary)",
    fontSize: 14,
  },
  checkbox: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 20,
    height: 20,
    minWidth: 20,
    minHeight: 20,
    flex: "0 0 20px",
    flexShrink: 0,
    padding: 0,
    borderWidth: 1,
    borderStyle: "solid",
    borderRadius: 6,
    cursor: "pointer",
    transition: "background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease",
  },
  empty: {
    ...CARD_SURFACE,
    gridColumn: "1 / -1",
    padding: 28,
    color: "var(--text-secondary)",
    textAlign: "center",
  },
  milestonesSection: {
    width: "100%",
    marginTop: 0,
    paddingTop: 16,
    borderTop: "1px solid var(--border-color)",
  },
  milestonesTitle: {
    margin: "0 0 10px",
    color: "var(--text-secondary)",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
  },
  milestoneList: {
    display: "grid",
    gap: 0,
    marginBottom: 0,
  },
  milestoneItem: {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-3)",
    padding: "var(--space-2) 0",
    border: "none",
    borderBottom: "1px solid var(--border-color)",
    borderRadius: 0,
    background: "transparent",
  },
  milestoneContent: {
    flex: 1,
    minWidth: 0,
  },
  milestoneTitle: {
    margin: 0,
    color: "var(--text-primary)",
    fontSize: 13,
    fontWeight: 500,
    overflowWrap: "anywhere",
  },
  milestoneTitleCompleted: {
    textDecoration: "line-through",
    color: "var(--text-muted)",
  },
  milestoneMeta: {
    margin: "2px 0 0",
    color: "var(--text-muted)",
    fontSize: 11,
  },
  milestoneActions: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  addMilestoneButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    padding: "8px 12px",
    border: "1px solid var(--card-surface-border)",
    borderRadius: 7,
    background: "var(--card-surface-bg)",
    color: "var(--text-secondary)",
    fontSize: 12,
    cursor: "pointer",
  },
  milestoneForm: {
    display: "grid",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTop: "1px solid var(--border-color)",
  },
  milestoneEditForm: {
    display: "grid",
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
};

export default function Goals({
  goals,
  tasks,
  habits,
  focusSessions,
  streakFreeze,
  dayResetHour,
  milestones = [],
  projects = [],
  onAddGoal,
  onToggleGoalArchive,
  onEditGoal,
  onDeleteGoal,
  onAddMilestone,
  onEditMilestone,
  onDeleteMilestone,
  onToggleMilestone,
  onOpenProject,
  onAddProject,
}: GoalsProps) {
  const [showForm, setShowForm] = useState(false);
  const [showArchivedGoals, setShowArchivedGoals] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [goalEditTitle, setGoalEditTitle] = useState("");
  const [goalEditDescription, setGoalEditDescription] = useState("");
  const [goalEditTargetDate, setGoalEditTargetDate] = useState("");
  const [milestoneGoalId, setMilestoneGoalId] = useState<string | null>(null);
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneTargetDate, setMilestoneTargetDate] = useState("");
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [milestoneEditTitle, setMilestoneEditTitle] = useState("");
  const [milestoneEditTargetDate, setMilestoneEditTargetDate] = useState("");
  const [itemToDelete, setItemToDelete] = useState<PendingDeletion | null>(null);
  const [milestoneProjectId, setMilestoneProjectId] = useState("");
  const [milestoneEditProjectId, setMilestoneEditProjectId] = useState("");
  const [projectGoalId, setProjectGoalId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");

  const activeGoals = goals.filter((goal) => goal.status !== "archived");
  const archivedGoals = goals.filter((goal) => goal.status === "archived");

  function confirmItemDeletion() {
    if (!itemToDelete) return;

    if (itemToDelete.type === "goal") onDeleteGoal(itemToDelete.id);
    if (itemToDelete.type === "milestone") onDeleteMilestone(itemToDelete.id);
    setItemToDelete(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    onAddGoal({
      title: trimmedTitle,
      description: description.trim() || undefined,
      targetDate: targetDate || undefined,
    });
    setTitle("");
    setDescription("");
    setTargetDate("");
    setShowForm(false);
  }

  function renderProjectSelect(
    value: string,
    onChange: (next: string) => void,
    goalId: string,
    ariaLabel: string,
  ) {
    const available = projects.filter((project) =>
      project.status !== "archived" && (project.goalId === undefined || project.goalId === goalId),
    );
    const current = value && !available.some((project) => project.id === value)
      ? projects.find((project) => project.id === value)
      : undefined;
    const options = current ? [...available, current] : available;
    if (options.length === 0) return null;

    return (
      <select
        style={styles.compactInput}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
      >
        <option value="">No Project</option>
        {options.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
    );
  }

  function projectNameFor(projectId?: string): string | undefined {
    return projectId ? projects.find((project) => project.id === projectId)?.name : undefined;
  }

  function beginGoalEdit(goal: Goal) {
    setEditingGoalId(goal.id);
    setGoalEditTitle(goal.title);
    setGoalEditDescription(goal.description ?? "");
    setGoalEditTargetDate(goal.targetDate ?? "");
  }

  function handleGoalEditSubmit(event: FormEvent<HTMLFormElement>, goalId: string) {
    event.preventDefault();
    const trimmedTitle = goalEditTitle.trim();
    if (!trimmedTitle) return;

    onEditGoal(goalId, {
      title: trimmedTitle,
      description: goalEditDescription.trim() || undefined,
      targetDate: goalEditTargetDate || undefined,
    });
    setEditingGoalId(null);
  }

  function handleProjectSubmit(event: FormEvent<HTMLFormElement>, goalId: string) {
    event.preventDefault();
    const trimmedName = projectName.trim();
    if (!trimmedName) return;

    onAddProject({
      name: trimmedName,
      goalId,
    });
    setProjectName("");
    setProjectGoalId(null);
  }

  function handleMilestoneSubmit(event: FormEvent<HTMLFormElement>, goalId: string) {
    event.preventDefault();
    const trimmedTitle = milestoneTitle.trim();
    if (!trimmedTitle) return;

    onAddMilestone({
      title: trimmedTitle,
      goalId,
      projectId: milestoneProjectId || undefined,
      targetDate: milestoneTargetDate || undefined,
    });
    setMilestoneTitle("");
    setMilestoneTargetDate("");
    setMilestoneProjectId("");
    setMilestoneGoalId(null);
  }

  function beginMilestoneEdit(milestone: Milestone) {
    setEditingMilestoneId(milestone.id);
    setMilestoneEditTitle(milestone.title);
    setMilestoneEditTargetDate(milestone.targetDate ?? "");
    setMilestoneEditProjectId(milestone.projectId ?? "");
  }

  function handleMilestoneEditSubmit(event: FormEvent<HTMLFormElement>, milestoneId: string) {
    event.preventDefault();
    const trimmedTitle = milestoneEditTitle.trim();
    if (!trimmedTitle) return;

    onEditMilestone(milestoneId, {
      title: trimmedTitle,
      projectId: milestoneEditProjectId || undefined,
      targetDate: milestoneEditTargetDate || undefined,
      goalId: milestones?.find((m) => m.id === milestoneId)?.goalId || "",
    });
    setEditingMilestoneId(null);
  }

  return (
    <section style={styles.page} aria-labelledby="goals-title">
      <header style={styles.header}>
        <h1 id="goals-title" style={styles.title}>Goals</h1>
        <button
          type="button"
          style={styles.addButton}
          onClick={() => setShowForm((visible) => !visible)}
          aria-expanded={showForm}
        >
          <Plus size={16} />
          New Goal
        </button>
      </header>

      {showForm && (
        <form style={styles.form} onSubmit={handleSubmit}>
          <h2 style={styles.formTitle}>Create a Goal</h2>
          <input
            autoFocus
            required
            maxLength={120}
            style={styles.input}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Goal Title"
            aria-label="Goal Title"
          />
          <textarea
            maxLength={500}
            style={{ ...styles.input, minHeight: 76, resize: "vertical" }}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description (Optional)"
            aria-label="Goal Description"
          />
          <label style={{ display: "grid", gap: 5, color: "var(--text-secondary)", fontSize: 12 }}>
            Target Date
            <input
              type="date"
              style={styles.input}
              value={targetDate}
              onChange={(event) => setTargetDate(event.target.value)}
            />
          </label>
          <div style={styles.formActions}>
            <button type="button" style={styles.secondaryButton} onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button type="submit" style={styles.submitButton}>Create Goal</button>
          </div>
        </form>
      )}

      <div style={styles.grid}>
        {activeGoals.length === 0 ? (
          <div style={styles.empty}>No active goals. Create one to get started.</div>
        ) : activeGoals.map((goal) => {
          const goalWork = selectGoalWork(goal, { projects, milestones, tasks, habits });
          const linkedHabits = goalWork.habits;
          const goalProjects = goalWork.projects;
          const goalMilestones = goalWork.milestones;
          const goalMilestoneIds = new Set(goalMilestones.map((milestone) => milestone.id));
          const goalTaskIds = new Set(goalWork.tasks.map((task) => task.id));
          const totalFocusMinutes = focusSessions
            .filter((session) =>
              session.goalId === goal.id ||
              (session.milestoneId && goalMilestoneIds.has(session.milestoneId)) ||
              (session.taskId && goalTaskIds.has(session.taskId)),
            )
            .reduce((total, session) => total + session.durationMinutes, 0);
          const focusHours = Math.floor(totalFocusMinutes / 60);
          const focusRemainder = totalFocusMinutes % 60;
          const focusTimeLabel = focusHours > 0
            ? `${focusHours}h ${focusRemainder}m`
            : `${focusRemainder}m`;
          const progress = calculateGoalProgress(goal, milestones, tasks, habits, streakFreeze, dayResetHour, projects);
          const progressPercent = progress.percent;

          return (
            <article key={goal.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <h2 style={styles.goalTitle}>{goal.title}</h2>
                <div style={styles.cardActions}>
                  <span style={styles.status}>{goal.status}</span>
                  <button
                    type="button"
                    style={styles.iconButton}
                    onClick={() => beginGoalEdit(goal)}
                    aria-label={`Edit "${goal.title}"`}
                    title="Edit Goal"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    style={styles.iconButton}
                    onClick={() => onToggleGoalArchive(goal.id)}
                    aria-label={goal.status === "archived" ? `Restore "${goal.title}"` : `Archive "${goal.title}"`}
                    title={goal.status === "archived" ? "Restore goal" : "Archive goal"}
                  >
                    {goal.status === "archived" ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                  </button>
                  <button
                    type="button"
                    style={styles.iconButton}
                    onClick={() => setItemToDelete({ type: "goal", id: goal.id, title: goal.title })}
                    aria-label={`Delete "${goal.title}"`}
                    title="Delete Goal"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              {editingGoalId === goal.id && (
                <form style={styles.goalEditForm} onSubmit={(event) => handleGoalEditSubmit(event, goal.id)}>
                  <input
                    required
                    maxLength={120}
                    style={styles.compactInput}
                    value={goalEditTitle}
                    onChange={(event) => setGoalEditTitle(event.target.value)}
                    aria-label="Goal Title"
                  />
                  <textarea
                    maxLength={500}
                    style={{ ...styles.compactInput, minHeight: 64, resize: "vertical" }}
                    value={goalEditDescription}
                    onChange={(event) => setGoalEditDescription(event.target.value)}
                    placeholder="Description (Optional)"
                    aria-label="Goal Description"
                  />
                  <input
                    type="date"
                    style={styles.compactInput}
                    value={goalEditTargetDate}
                    onChange={(event) => setGoalEditTargetDate(event.target.value)}
                    aria-label="Goal Target Date"
                  />
                  <div style={styles.formActions}>
                    <button type="button" style={styles.secondaryButton} onClick={() => setEditingGoalId(null)}>
                      Cancel
                    </button>
                    <button type="submit" style={styles.submitButton}>Save Goal</button>
                  </div>
                </form>
              )}
              {goal.description && <p style={styles.description}>{goal.description}</p>}
              {goal.targetDate && (
                <p style={styles.meta}>
                  Target: <time dateTime={goal.targetDate}>{formatFullDate(goal.targetDate)}</time>
                </p>
              )}
              <div
                style={styles.progressTrack}
                role="progressbar"
                aria-label={`"${goal.title}" progress`}
                aria-valuemin={0}
                aria-valuemax={progress.total || 1}
                aria-valuenow={progress.completed}
              >
                <div style={styles.progressSegments}>
                  <div 
                    style={{ 
                      ...styles.progressSegmentTask, 
                      width: `${progress.taskSegmentWidth}%` 
                    }} 
                  />
                  <div 
                    style={{ 
                      ...styles.progressSegmentMilestone, 
                      width: `${progress.milestoneSegmentWidth}%` 
                    }} 
                  />
                  <div 
                    style={{ 
                      ...styles.progressSegmentHabit, 
                      width: `${progress.habitSegmentWidth}%` 
                    }} 
                  />
                </div>
              </div>
              <div style={styles.progressLegend}>
                <div style={styles.progressLegendItem}>
                  <div style={{ ...styles.progressLegendDot, ...styles.progressLegendDotTask }} />
                  <span>Tasks ({progress.taskWeight}%)</span>
                </div>
                <div style={styles.progressLegendItem}>
                  <div style={{ ...styles.progressLegendDot, ...styles.progressLegendDotMilestone }} />
                  <span>Milestones ({progress.milestoneWeight}%)</span>
                </div>
                <div style={styles.progressLegendItem}>
                  <div style={{ ...styles.progressLegendDot, ...styles.progressLegendDotHabit }} />
                  <span>Habit Streak ({progress.habitWeight}%)</span>
                </div>
              </div>
              <p style={styles.meta}>
                {progress.completed} of {progress.total} Items Complete · {progressPercent}%
              </p>
              <p style={{ ...styles.meta, marginTop: 6 }}>Total Focus: {focusTimeLabel}</p>

              <section style={styles.linkedHabits} aria-label={`Projects for "${goal.title}"`}>
                <h3 style={styles.linkedHabitsTitle}>Projects</h3>
                {goalProjects.map((project) => {
                  const projectProgress = calculateProjectProgress(project, milestones, tasks);
                  return (
                    <div key={project.id} style={styles.linkedHabitRow}>
                      <button
                        type="button"
                        style={styles.projectOpenButton}
                        onClick={() => onOpenProject(project.id)}
                        aria-label={`Open project "${project.name}"`}
                      >
                        {project.name}
                      </button>
                      <span style={styles.projectRowMeta}>
                        <span style={styles.status}>{project.status}</span>
                        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                          {projectProgress.percent}%
                        </span>
                        <span style={styles.projectProgressTrack}>
                          <span
                            style={{
                              display: "block",
                              height: "100%",
                              width: `${projectProgress.percent}%`,
                              background: "var(--color-accent)",
                            }}
                          />
                        </span>
                      </span>
                    </div>
                  );
                })}

                {projectGoalId === goal.id ? (
                  <form style={styles.milestoneForm} onSubmit={(event) => handleProjectSubmit(event, goal.id)}>
                    <input
                      autoFocus
                      required
                      maxLength={120}
                      style={styles.compactInput}
                      value={projectName}
                      onChange={(event) => setProjectName(event.target.value)}
                      placeholder="Project Name"
                      aria-label={`Project Name for "${goal.title}"`}
                    />
                    <div style={styles.formActions}>
                      <button type="button" style={styles.secondaryButton} onClick={() => setProjectGoalId(null)}>
                        Cancel
                      </button>
                      <button type="submit" style={styles.submitButton}>Add Project</button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    style={styles.addMilestoneButton}
                    onClick={() => setProjectGoalId(goal.id)}
                  >
                    <Plus size={14} />
                    Add Project
                  </button>
                )}
              </section>

              <section style={styles.linkedHabits} aria-label={`Habits linked to "${goal.title}"`}>
                <h3 style={styles.linkedHabitsTitle}>Linked Habits</h3>
                {linkedHabits.length === 0 ? (
                  <p style={{ ...styles.meta, marginTop: 0 }}>No Linked Habits</p>
                ) : linkedHabits.map((habit) => (
                  <div key={habit.id} style={styles.linkedHabitRow}>
                    <span style={styles.linkedHabitName}>{habit.name}</span>
                    <StreakBadge streak={calculateStreak(habit, streakFreeze, dayResetHour)} />
                  </div>
                ))}
              </section>

              <section style={styles.milestonesSection} aria-label={`Milestones for "${goal.title}"`}>
                <h3 style={styles.milestonesTitle}>Milestones</h3>
                  {goalMilestones.length === 0 ? (
                  <p style={{ ...styles.meta, marginTop: 0, marginBottom: 12 }}>No milestones yet.</p>
                ) : (
                  <div style={styles.milestoneList}>
                    {goalMilestones.map((milestone) => (
                      <div key={milestone.id} style={styles.milestoneItem}>
                        {editingMilestoneId === milestone.id ? (
                          <form style={styles.milestoneEditForm} onSubmit={(event) => handleMilestoneEditSubmit(event, milestone.id)}>
                            <input
                              autoFocus
                              required
                              maxLength={120}
                              style={styles.compactInput}
                              value={milestoneEditTitle}
                              onChange={(event) => setMilestoneEditTitle(event.target.value)}
                              aria-label="Milestone Title"
                            />
                            <input
                              type="date"
                              style={styles.compactInput}
                              value={milestoneEditTargetDate}
                              onChange={(event) => setMilestoneEditTargetDate(event.target.value)}
                              aria-label="Milestone Target Date"
                            />
                            {renderProjectSelect(
                              milestoneEditProjectId,
                              setMilestoneEditProjectId,
                              goal.id,
                              "Link to Project (Optional)",
                            )}
                            <div style={styles.formActions}>
                              <button type="button" style={styles.secondaryButton} onClick={() => setEditingMilestoneId(null)}>
                                Cancel
                              </button>
                              <button type="submit" style={styles.submitButton}>Save</button>
                            </div>
                          </form>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="milestone-checkbox"
                              style={styles.checkbox}
                              onClick={() => onToggleMilestone(goal.id, milestone.id)}
                              aria-pressed={milestone.completed}
                              aria-label={`${milestone.completed ? "Mark incomplete" : "Complete"} milestone: "${milestone.title}"`}
                            >
                              {milestone.completed && (
                                <Check className="milestone-checkbox-icon" width={14} height={14} strokeWidth={2.5} />
                              )}
                            </button>
                            <div style={styles.milestoneContent}>
                              <h4
                                style={{
                                  ...styles.milestoneTitle,
                                  ...(milestone.completed ? styles.milestoneTitleCompleted : {}),
                                }}
                              >
                                {milestone.title}
                              </h4>
                              {milestone.targetDate && (
                                <p style={styles.milestoneMeta}>
                                  Target: <time dateTime={milestone.targetDate}>{formatFullDate(milestone.targetDate)}</time>
                                </p>
                              )}
                              {projectNameFor(milestone.projectId) && (
                                <p style={styles.milestoneMeta}>
                                  Project: {projectNameFor(milestone.projectId)}
                                </p>
                              )}
                            </div>
                            <div style={styles.milestoneActions}>
                              <button
                                type="button"
                                style={styles.iconButton}
                                onClick={() => beginMilestoneEdit(milestone)}
                                aria-label={`Edit "${milestone.title}"`}
                                title="Edit Milestone"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                style={styles.iconButton}
                                onClick={() => setItemToDelete({
                                  type: "milestone",
                                  id: milestone.id,
                                  goalId: milestone.goalId,
                                  title: milestone.title,
                                })}
                                aria-label={`Delete "${milestone.title}"`}
                                title="Delete Milestone"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {milestoneGoalId === goal.id ? (
                  <form style={styles.milestoneForm} onSubmit={(event) => handleMilestoneSubmit(event, goal.id)}>
                    <input
                      autoFocus
                      required
                      maxLength={120}
                      style={styles.compactInput}
                      value={milestoneTitle}
                      onChange={(event) => setMilestoneTitle(event.target.value)}
                      placeholder="Milestone Title"
                      aria-label={`Milestone Title for "${goal.title}"`}
                    />
                    <input
                      type="date"
                      style={styles.compactInput}
                      value={milestoneTargetDate}
                      onChange={(event) => setMilestoneTargetDate(event.target.value)}
                      aria-label="Milestone Target Date"
                    />
                    {renderProjectSelect(
                      milestoneProjectId,
                      setMilestoneProjectId,
                      goal.id,
                      "Link to Project (Optional)",
                    )}
                    <div style={styles.formActions}>
                      <button type="button" style={styles.secondaryButton} onClick={() => setMilestoneGoalId(null)}>
                        Cancel
                      </button>
                      <button type="submit" style={styles.submitButton}>Add Milestone</button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    style={styles.addMilestoneButton}
                    onClick={() => setMilestoneGoalId(goal.id)}
                  >
                    <Plus size={14} />
                    Add Milestone
                  </button>
                )}
              </section>
            </article>
          );
        })}
      </div>

      {archivedGoals.length > 0 && (
        <section style={styles.archivedSection} aria-label="Archived Goals">
          <button
            type="button"
            style={styles.archivedToggle}
            onClick={() => setShowArchivedGoals((visible) => !visible)}
            aria-expanded={showArchivedGoals}
          >
            <span>
              {showArchivedGoals ? "Hide" : "Show"} Archived Goals ({archivedGoals.length})
            </span>
            {showArchivedGoals ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showArchivedGoals && (
            <div style={styles.archivedList}>
              {archivedGoals.map((goal) => (
                <article key={goal.id} style={styles.card}>
                  <div style={styles.cardHeader}>
                    <h2 style={styles.goalTitle}>{goal.title}</h2>
                    <div style={styles.cardActions}>
                      <span style={styles.status}>Archived</span>
                      <button
                        type="button"
                        style={styles.iconButton}
                        onClick={() => onToggleGoalArchive(goal.id)}
                        aria-label={`Restore "${goal.title}"`}
                        title="Restore Goal"
                      >
                        <ArchiveRestore size={15} />
                      </button>
                    </div>
                  </div>
                  {goal.description && (
                    <p style={styles.archivedGoalDescription}>{goal.description}</p>
                  )}
                  {goal.targetDate && (
                    <p style={styles.meta}>
                      Target: <time dateTime={goal.targetDate}>{formatFullDate(goal.targetDate)}</time>
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {itemToDelete && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setItemToDelete(null)}
        >
          <div
            className="delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="goals-delete-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="goals-delete-modal-title">Delete "{itemToDelete.title}"?</h2>
            <p>This action cannot be undone.</p>
            <div className="delete-modal-actions">
              <button
                type="button"
                className="delete-modal-cancel"
                onClick={() => setItemToDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="delete-modal-confirm"
                onClick={confirmItemDeletion}
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