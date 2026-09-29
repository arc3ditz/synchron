import { useState, type CSSProperties, type FormEvent } from "react";
import { Check, Plus } from "lucide-react";

import { CARD_SURFACE } from "../theme";
import type { Goal, Milestone, Task } from "../types";
import { filterTasksByGoal } from "../domain/tasks";

type GoalsProps = {
  goals: Goal[];
  tasks: Task[];
  milestones?: Milestone[];
  onAddGoal: (data: Omit<Goal, "id" | "createdAt" | "status">) => void;
  onToggleTask: (taskId: string) => void;
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
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    background: "var(--bg-inset)",
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
    border: "1px solid var(--border-strong)",
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
  taskList: {
    display: "grid",
    gap: 6,
    margin: "14px 0 0",
    padding: 0,
    listStyle: "none",
  },
  taskButton: {
    display: "flex",
    alignItems: "center",
    width: "100%",
    gap: 9,
    padding: "8px 0",
    border: 0,
    background: "transparent",
    color: "var(--text-body)",
    textAlign: "left",
    cursor: "pointer",
  },
  taskCheck: {
    display: "grid",
    placeItems: "center",
    width: 18,
    height: 18,
    flex: "0 0 18px",
    border: "1px solid var(--border-strong)",
    borderRadius: 5,
    color: "var(--bg-primary)",
  },
  empty: {
    ...CARD_SURFACE,
    gridColumn: "1 / -1",
    padding: 28,
    color: "var(--text-secondary)",
    textAlign: "center",
  },
};

export default function Goals({ goals, tasks, milestones = [], onAddGoal, onToggleTask }: GoalsProps) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");

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
          const goalMilestones = milestones.filter((milestone) => milestone.goalId === goal.id);
          const milestoneIds = new Set(goalMilestones.map((milestone) => milestone.id));
          const goalTasks = filterTasksByGoal(tasks, goal.id).concat(
            tasks.filter((task) => !task.goalId && task.milestoneId && milestoneIds.has(task.milestoneId)),
          );
          const completedCount = goalTasks.filter((task) => task.completed).length;
          const progress = goalTasks.length ? (completedCount / goalTasks.length) * 100 : 0;

          return (
            <article key={goal.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <h2 style={styles.goalTitle}>{goal.title}</h2>
                <span style={styles.status}>{goal.status}</span>
              </div>
              {goal.description && <p style={styles.description}>{goal.description}</p>}
              {goal.targetDate && (
                <p style={styles.meta}>
                  Target <time dateTime={goal.targetDate}>{goal.targetDate}</time>
                </p>
              )}
              <div
                style={styles.progressTrack}
                role="progressbar"
                aria-label={`${goal.title} task progress`}
                aria-valuemin={0}
                aria-valuemax={goalTasks.length}
                aria-valuenow={completedCount}
              >
                <div style={{ width: `${progress}%`, height: "100%", background: "var(--accent-teal)" }} />
              </div>
              <p style={styles.meta}>{completedCount} of {goalTasks.length} tasks complete</p>

              {goalMilestones.map((milestone) => (
                <p key={milestone.id} style={styles.meta}>
                  {milestone.completed ? "Completed milestone" : "Milestone"}: {milestone.title}
                </p>
              ))}

              {goalTasks.length > 0 && (
                <ul style={styles.taskList}>
                  {goalTasks.map((task) => (
                    <li key={task.id}>
                      <button
                        type="button"
                        style={styles.taskButton}
                        onClick={() => onToggleTask(task.id)}
                        aria-pressed={task.completed}
                        aria-label={`${task.completed ? "Mark incomplete" : "Complete"}: ${task.title}`}
                      >
                        <span
                          style={{
                            ...styles.taskCheck,
                            ...(task.completed ? { background: "var(--accent-teal)", borderColor: "var(--accent-teal)" } : {}),
                          }}
                        >
                          {task.completed && <Check size={13} />}
                        </span>
                        <span style={{ overflowWrap: "anywhere", textDecoration: task.completed ? "line-through" : "none" }}>
                          {task.title}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}