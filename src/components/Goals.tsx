import { useState, type CSSProperties, type FormEvent } from "react";
import { Archive, ArchiveRestore, Check, Pencil, Plus, Trash2 } from "lucide-react";

import { CARD_SURFACE } from "../theme";
import type { Goal, Habit, Milestone, Task } from "../types";
import { filterTasksByGoal } from "../domain/tasks";
import { calculateStreak, formatFullDate } from "../utils/dates";

type GoalsProps = {
  goals: Goal[];
  tasks: Task[];
  habits: Habit[];
  streakFreeze: boolean;
  dayResetHour: number;
  milestones?: Milestone[];
  onAddGoal: (data: Omit<Goal, "id" | "createdAt" | "status">) => void;
  onAddTask: (data: Omit<Task, "id" | "createdAt" | "completed">) => void;
  onToggleTask: (taskId: string) => void;
  onToggleGoalArchive: (goalId: string) => void;
  onEditGoal: (goalId: string, data: Omit<Goal, "id" | "createdAt" | "status">) => void;
  onDeleteGoal: (goalId: string) => void;
  onEditTask: (taskId: string, data: Omit<Task, "id" | "createdAt" | "completed">) => void;
  onDeleteTask: (taskId: string) => void;
};

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

const styles: Record<string, CSSProperties> = {
  page: {
    width: "100%",
    maxWidth: 900,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 24,
  },
  title: {
    margin: 0,
    color: "var(--text-primary)",
    fontSize: 24,
    fontWeight: 650,
  },
  addButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flexShrink: 0,
    padding: "9px 14px",
    border: "1px solid var(--accent-border)",
    borderRadius: 8,
    background: "var(--accent-wash)",
    color: "var(--accent-teal)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  form: {
    ...CARD_SURFACE,
    display: "grid",
    gap: 12,
    marginBottom: 20,
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
    padding: "10px 12px",
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
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
    gap: 12,
  },
  card: {
    ...CARD_SURFACE,
    minWidth: 0,
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
    height: 5,
    marginTop: 14,
    borderRadius: 3,
    background: "var(--bg-inset)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "var(--accent-teal)",
    transition: "width 0.2s ease",
  },
  taskList: {
    display: "grid",
    gap: 6,
    margin: "14px 0 0",
    padding: "0 4px",
    listStyle: "none",
  },
  linkedHabits: {
    display: "grid",
    gap: 7,
    marginTop: 16,
    paddingTop: 12,
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
  linkedHabitStreak: {
    flexShrink: 0,
    color: "var(--accent-amber)",
    fontSize: 12,
    fontWeight: 600,
  },
  taskRow: {
    display: "flex",
    alignItems: "center",
    gap: 9,
  },
  taskButton: {
    display: "flex",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    gap: 9,
    padding: "8px 10px",
    border: "1px solid transparent",
    borderRadius: 8,
    background: "transparent",
    color: "var(--text-body)",
    textAlign: "left",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  taskButtonHover: {
    background: "var(--button-hover-bg)",
    borderColor: "var(--button-hover-border)",
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
    borderRadius: 10,
    fontSize: 10,
    fontWeight: 600,
    textTransform: "capitalize",
  },
  addTaskButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
    padding: "6px 9px",
    border: "1px solid var(--border-strong)",
    borderRadius: 7,
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: 12,
    cursor: "pointer",
  },
  taskForm: {
    display: "grid",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTop: "1px solid var(--border-color)",
  },
  taskEditForm: {
    display: "grid",
    flex: 1,
    minWidth: 0,
    gap: 6,
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
    padding: "7px 9px",
    border: "1px solid var(--card-surface-border)",
    borderRadius: 7,
    background: "var(--card-surface-bg)",
    color: "var(--text-primary)",
    fontSize: 12,
  },
  taskFormFields: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr) minmax(82px, 0.7fr)",
    gap: 6,
  },
  taskCheck: {
    display: "grid",
    placeItems: "center",
    width: 18,
    height: 18,
    flex: "0 0 18px",
    border: "1px solid var(--checkbox-border)",
    borderRadius: 5,
    background: "transparent",
    color: "#ffffff",
    transition: "all 0.15s ease",
  },
  taskCheckCompleted: {
    background: "var(--checkbox-checked-bg)",
    borderColor: "var(--checkbox-checked-border)",
    boxShadow: "var(--checkbox-checked-shadow)",
  },
  empty: {
    ...CARD_SURFACE,
    gridColumn: "1 / -1",
    padding: 28,
    color: "var(--text-secondary)",
    textAlign: "center",
  },
};

export default function Goals({
  goals,
  tasks,
  habits,
  streakFreeze,
  dayResetHour,
  milestones = [],
  onAddGoal,
  onAddTask,
  onToggleTask,
  onToggleGoalArchive,
  onEditGoal,
  onDeleteGoal,
  onEditTask,
  onDeleteTask,
}: GoalsProps) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [taskGoalId, setTaskGoalId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskEstimatedMinutes, setTaskEstimatedMinutes] = useState("");
  const [taskPriority, setTaskPriority] = useState<Task["priority"]>("medium");
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [goalEditTitle, setGoalEditTitle] = useState("");
  const [goalEditDescription, setGoalEditDescription] = useState("");
  const [goalEditTargetDate, setGoalEditTargetDate] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskEditTitle, setTaskEditTitle] = useState("");
  const [taskEditDueDate, setTaskEditDueDate] = useState("");
  const [taskEditEstimatedMinutes, setTaskEditEstimatedMinutes] = useState("");
  const [taskEditPriority, setTaskEditPriority] = useState<Task["priority"]>("medium");

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

  function handleTaskSubmit(event: FormEvent<HTMLFormElement>, goalId: string) {
    event.preventDefault();
    const trimmedTitle = taskTitle.trim();
    if (!trimmedTitle) return;

    const estimatedMinutes = Number(taskEstimatedMinutes);
    onAddTask({
      title: trimmedTitle,
      goalId,
      dueDate: taskDueDate || undefined,
      estimatedMinutes: Number.isFinite(estimatedMinutes) && estimatedMinutes > 0
        ? estimatedMinutes
        : undefined,
      priority: taskPriority,
    });
    setTaskTitle("");
    setTaskDueDate("");
    setTaskEstimatedMinutes("");
    setTaskPriority("medium");
    setTaskGoalId(null);
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

  function beginTaskEdit(task: Task) {
    setEditingTaskId(task.id);
    setTaskEditTitle(task.title);
    setTaskEditDueDate(task.dueDate ?? "");
    setTaskEditEstimatedMinutes(task.estimatedMinutes?.toString() ?? "");
    setTaskEditPriority(task.priority);
  }

  function handleTaskEditSubmit(event: FormEvent<HTMLFormElement>, task: Task) {
    event.preventDefault();
    const trimmedTitle = taskEditTitle.trim();
    if (!trimmedTitle) return;

    const estimatedMinutes = Number(taskEditEstimatedMinutes);
    onEditTask(task.id, {
      title: trimmedTitle,
      dueDate: taskEditDueDate || undefined,
      estimatedMinutes: Number.isFinite(estimatedMinutes) && estimatedMinutes > 0
        ? estimatedMinutes
        : undefined,
      priority: taskEditPriority,
      goalId: task.goalId,
      milestoneId: task.milestoneId,
    });
    setEditingTaskId(null);
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
          <h2 style={styles.formTitle}>Create a goal</h2>
          <input
            autoFocus
            required
            maxLength={120}
            style={styles.input}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Goal title"
            aria-label="Goal title"
          />
          <textarea
            maxLength={500}
            style={{ ...styles.input, minHeight: 76, resize: "vertical" }}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description (optional)"
            aria-label="Goal description"
          />
          <label style={{ display: "grid", gap: 5, color: "var(--text-secondary)", fontSize: 12 }}>
            Target date
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
        {goals.length === 0 ? (
          <div style={styles.empty}>No goals yet. Create one to get started.</div>
        ) : goals.map((goal) => {
          const linkedHabits = habits.filter((habit) => habit.goalId === goal.id);
          const goalMilestones = milestones.filter((milestone) => milestone.goalId === goal.id);
          const milestoneIds = new Set(goalMilestones.map((milestone) => milestone.id));
          const goalTasks = filterTasksByGoal(tasks, goal.id).concat(
            tasks.filter((task) => !task.goalId && task.milestoneId && milestoneIds.has(task.milestoneId)),
          );
          const completedCount = goalTasks.filter((task) => task.completed).length;
          const progress = goalTasks.length ? (completedCount / goalTasks.length) * 100 : 0;
          const progressPercent = Math.round(progress);

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
                    aria-label={`Edit ${goal.title}`}
                    title="Edit goal"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    style={styles.iconButton}
                    onClick={() => onToggleGoalArchive(goal.id)}
                    aria-label={goal.status === "archived" ? `Restore ${goal.title}` : `Archive ${goal.title}`}
                    title={goal.status === "archived" ? "Restore goal" : "Archive goal"}
                  >
                    {goal.status === "archived" ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                  </button>
                  <button
                    type="button"
                    style={styles.iconButton}
                    onClick={() => {
                      if (window.confirm(`Delete "${goal.title}"? Its linked tasks will be deleted and habits unlinked.`)) {
                        onDeleteGoal(goal.id);
                      }
                    }}
                    aria-label={`Delete ${goal.title}`}
                    title="Delete goal"
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
                    aria-label="Goal title"
                  />
                  <textarea
                    maxLength={500}
                    style={{ ...styles.compactInput, minHeight: 64, resize: "vertical" }}
                    value={goalEditDescription}
                    onChange={(event) => setGoalEditDescription(event.target.value)}
                    placeholder="Description (optional)"
                    aria-label="Goal description"
                  />
                  <input
                    type="date"
                    style={styles.compactInput}
                    value={goalEditTargetDate}
                    onChange={(event) => setGoalEditTargetDate(event.target.value)}
                    aria-label="Goal target date"
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
                aria-label={`${goal.title} task progress`}
                aria-valuemin={0}
                aria-valuemax={goalTasks.length || 1}
                aria-valuenow={completedCount}
              >
                <div style={{ ...styles.progressFill, width: `${progress}%` }} />
              </div>
              <p style={styles.meta}>
                {completedCount} of {goalTasks.length} tasks complete · {progressPercent}%
              </p>

              <section style={styles.linkedHabits} aria-label={`Habits linked to ${goal.title}`}>
                <h3 style={styles.linkedHabitsTitle}>Linked Habits</h3>
                {linkedHabits.length === 0 ? (
                  <p style={{ ...styles.meta, marginTop: 0 }}>No linked habits</p>
                ) : linkedHabits.map((habit) => (
                  <div key={habit.id} style={styles.linkedHabitRow}>
                    <span style={styles.linkedHabitName}>{habit.name}</span>
                    <span style={styles.linkedHabitStreak}>
                      {calculateStreak(habit, streakFreeze, dayResetHour)} day streak
                    </span>
                  </div>
                ))}
              </section>

              {goalMilestones.map((milestone) => (
                <p key={milestone.id} style={styles.meta}>
                  {milestone.completed ? "Completed milestone" : "Milestone"}: {milestone.title}
                </p>
              ))}

              {goalTasks.length > 0 && (
                <ul style={styles.taskList}>
                  {goalTasks.map((task) => (
                    <li key={task.id}>
                      <div style={styles.taskRow}>
                        {editingTaskId === task.id ? (
                          <form style={styles.taskEditForm} onSubmit={(event) => handleTaskEditSubmit(event, task)}>
                            <input
                              autoFocus
                              required
                              maxLength={120}
                              style={styles.compactInput}
                              value={taskEditTitle}
                              onChange={(event) => setTaskEditTitle(event.target.value)}
                              aria-label="Task title"
                            />
                            <div style={styles.taskFormFields}>
                              <input
                                type="date"
                                style={styles.compactInput}
                                value={taskEditDueDate}
                                onChange={(event) => setTaskEditDueDate(event.target.value)}
                                aria-label="Task due date"
                              />
                              <input
                                type="number"
                                min={1}
                                step={1}
                                style={styles.compactInput}
                                value={taskEditEstimatedMinutes}
                                onChange={(event) => setTaskEditEstimatedMinutes(event.target.value)}
                                placeholder="Minutes"
                                aria-label="Estimated minutes"
                              />
                              <select
                                style={styles.compactInput}
                                value={taskEditPriority}
                                onChange={(event) => setTaskEditPriority(event.target.value as Task["priority"])}
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
                        ) : (
                          <>
                            <button
                              type="button"
                              style={styles.taskButton}
                              onClick={() => onToggleTask(task.id)}
                              aria-pressed={task.completed}
                              aria-label={`${task.completed ? "Mark incomplete" : "Complete"}: ${task.title}`}
                              onMouseEnter={(e) => {
                                Object.assign(e.currentTarget.style, styles.taskButtonHover);
                              }}
                              onMouseLeave={(e) => {
                                Object.assign(e.currentTarget.style, styles.taskButton);
                              }}
                            >
                              <span
                                style={{
                                  ...styles.taskCheck,
                                  ...(task.completed ? styles.taskCheckCompleted : {}),
                                }}
                              >
                                {task.completed && <Check size={13} />}
                              </span>
                              <span style={styles.taskDetails}>
                                <span style={{ overflowWrap: "anywhere", textDecoration: task.completed ? "line-through" : "none" }}>
                                  {task.title}
                                </span>
                                <span style={styles.taskMetadata}>
                                  <span style={{ ...styles.priorityBadge, ...priorityStyles[task.priority] }}>
                                    {task.priority}
                                  </span>
                                  {task.dueDate && (
                                    <time dateTime={task.dueDate}>Due {formatFullDate(task.dueDate)}</time>
                                  )}
                                  {task.estimatedMinutes && <span>{task.estimatedMinutes} min</span>}
                                </span>
                              </span>
                            </button>
                            <button
                              type="button"
                              style={styles.iconButton}
                              onClick={() => beginTaskEdit(task)}
                              aria-label={`Edit ${task.title}`}
                              title="Edit task"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              style={styles.iconButton}
                              onClick={() => {
                                if (window.confirm(`Delete task "${task.title}"?`)) onDeleteTask(task.id);
                              }}
                              aria-label={`Delete ${task.title}`}
                              title="Delete task"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {taskGoalId === goal.id ? (
                <form style={styles.taskForm} onSubmit={(event) => handleTaskSubmit(event, goal.id)}>
                  <input
                    autoFocus
                    required
                    maxLength={120}
                    style={styles.compactInput}
                    value={taskTitle}
                    onChange={(event) => setTaskTitle(event.target.value)}
                    placeholder="Task title"
                    aria-label={`Task title for ${goal.title}`}
                  />
                  <div style={styles.taskFormFields}>
                    <input
                      type="date"
                      style={styles.compactInput}
                      value={taskDueDate}
                      onChange={(event) => setTaskDueDate(event.target.value)}
                      aria-label="Task due date"
                    />
                    <input
                      type="number"
                      min={1}
                      step={1}
                      style={styles.compactInput}
                      value={taskEstimatedMinutes}
                      onChange={(event) => setTaskEstimatedMinutes(event.target.value)}
                      placeholder="Minutes"
                      aria-label="Estimated minutes"
                    />
                    <select
                      style={styles.compactInput}
                      value={taskPriority}
                      onChange={(event) => setTaskPriority(event.target.value as Task["priority"])}
                      aria-label="Task priority"
                    >
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                  <div style={styles.formActions}>
                    <button type="button" style={styles.secondaryButton} onClick={() => setTaskGoalId(null)}>
                      Cancel
                    </button>
                    <button type="submit" style={styles.submitButton}>Add Task</button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  style={styles.addTaskButton}
                  onClick={() => setTaskGoalId(goal.id)}
                >
                  <Plus size={14} />
                  Add Task
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}