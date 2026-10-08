import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Check, ListChecks, Play, Plus, Clock, MoreVertical, X, Target, History as HistoryIcon, BarChart3 } from "lucide-react";
import { CARD_SURFACE, FORM_CONTROL } from "../theme";
import StreakBadge from "./StreakBadge";
import type { FocusSessionRecord, Goal, Habit, Milestone, Project, Task } from "../types";
import {
  getTodayKey,
  isHabitScheduledOnDate,
  calculateStreak,
  formatFullDate,
} from "../utils/dates";
import { calculateGoalProgress } from "../domain/goals";
import { getFocusSessionsForLogicalToday } from "../domain/focusTimer";
import { buildDailyTimeline, totalPlannedMinutes as sumPlannedMinutes, type TimelineBlock } from "../domain/timeline";
import { isTaskOverdue, resolveTaskContext, selectTodayTasks, sortTodayTasks } from "../domain/tasks";

type TodayProps = {
  viewMode: "grid" | "list";
  habits: Habit[];
  tasks: Task[];
  goals: Goal[];
  milestones: Milestone[];
  projects?: Project[];
  focusSessions: FocusSessionRecord[];
  onToggleHabit: (id: number, dateKey?: string) => void;
  onToggleTask: (id: string) => void;
  onAddTask: (data: Omit<Task, "id" | "createdAt" | "completed">) => void;
  onQuickTaskFocusReady?: (focus: (() => void) | null) => void;
  onStartFocus: (entityId?: { taskId?: string; habitId?: number; goalId?: string; title?: string }) => void;
  onNavigateToHabits: () => void;
  onNavigateToGoals: () => void;
  onNavigateToHistory: () => void;
  onNavigateToAnalytics: () => void;
  streakFreeze: boolean;
  dayResetHour: number;
  showMandatoryHabitsInImportantItems: boolean;
  onUpdateHabit: (habit: Habit) => void;
  onUpdateTask: (task: Task) => void;
};

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: "100%",
    width: "100%",
    padding: "var(--space-4)",
    boxSizing: "border-box",
  },
  header: {
    marginBottom: "var(--space-6)",
  },
  title: {
    fontSize: "var(--type-xl)",
    fontWeight: "var(--font-bold)",
    color: "var(--text-primary)",
    margin: "0 0 8px",
  },
  date: {
    fontSize: "var(--type-base)",
    color: "var(--text-secondary)",
    margin: "0 0 16px",
  },
  briefing: {
    fontSize: "var(--type-sm)",
    color: "var(--text-secondary)",
    margin: "0 0 16px",
  },
  eyebrow: {
    fontSize: "var(--type-xs)",
    fontWeight: "var(--font-semibold)",
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    margin: "0 0 var(--space-2)",
  },
  nextUp: {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-3)",
    padding: "var(--space-3) 0",
    marginBottom: "var(--space-6)",
    borderBottom: "1px solid var(--border-color)",
  },
  nextUpInfo: {
    flex: 1,
    minWidth: 0,
  },
  nextUpTitle: {
    fontSize: "var(--type-base)",
    fontWeight: "var(--font-semibold)",
    color: "var(--text-primary)",
    margin: "0 0 4px",
    overflowWrap: "anywhere",
  },
  nextUpMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    color: "var(--text-secondary)",
    fontSize: "var(--type-xs)",
  },
  nextUpActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  nextUpClear: {
    fontSize: "var(--type-base)",
    color: "var(--text-secondary)",
    margin: 0,
  },
  progressSection: {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-4)",
    marginBottom: "var(--space-6)",
  },
  progressText: {
    fontSize: "var(--type-sm)",
    color: "var(--text-body)",
    fontWeight: 500,
  },
  progressBar: {
    flex: 1,
    height: "var(--space-1)",
    background: "var(--bg-inset)",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "var(--color-accent)",
    transition: "width 0.3s ease",
  },
  section: {
    marginBottom: "var(--space-6)",
  },
  sectionTitle: {
    fontSize: "var(--type-md)",
    fontWeight: "var(--font-semibold)",
    color: "var(--text-primary)",
    margin: "0 0 var(--space-3)",
  },
  habitList: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-2)",
  },
  habitGridList: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "var(--space-4)",
  },
  taskList: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-2)",
  },
  habitCard: {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-3)",
    padding: "var(--space-3) 0",
    width: "100%",
    height: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    background: "transparent",
    border: "none",
    borderBottom: "1px solid var(--border-color)",
    borderRadius: 0,
  },
  habitCardGrid: {
    ...CARD_SURFACE,
    padding: "var(--space-3)",
    background: "var(--color-surface)",
  },
  habitInfo: {
    flex: 1,
    minWidth: 0,
  },
  habitName: {
    fontSize: 15,
    fontWeight: 500,
    color: "var(--text-body)",
    margin: "0 0 6px",
  },
  habitMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  priorityBadge: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 22,
    fontSize: "var(--type-xs)",
    fontWeight: "var(--font-medium)",
    borderRadius: "var(--radius-md)",
    padding: "2px var(--space-2)",
    whiteSpace: "nowrap",
  },
  priorityMandatory: {
    color: "var(--color-accent)",
    background: "var(--accent-wash-soft)",
    border: "1px solid var(--accent-border-soft)",
  },
  priorityOptional: {
    color: "var(--text-secondary)",
    background: "var(--color-priority-neutral-wash)",
    border: "1px solid var(--border-color)",
  },
  categoryBadge: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 22,
    fontSize: "var(--type-xs)",
    fontWeight: "var(--font-medium)",
    padding: "2px var(--space-2)",
    borderRadius: "var(--radius-md)",
    backgroundColor: "var(--color-category-wash)",
    color: "var(--color-category)",
    border: "1px solid var(--color-category-border)",
    whiteSpace: "nowrap",
  },
  habitCardCompleted: {
    background: "var(--accent-wash-soft)",
    borderBottom: "1px solid var(--accent-border-soft)",
    opacity: 1,
  },
  habitNameCompleted: {
    color: "var(--text-dim)",
    textDecoration: "line-through",
  },
  taskName: {
    fontSize: 15,
    fontWeight: 500,
    color: "var(--text-body)",
    margin: "0 0 5px",
  },
  taskMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    color: "var(--text-secondary)",
    fontSize: 12,
  },
  taskNameCompleted: {
    color: "var(--text-dim)",
    textDecoration: "line-through",
  },
  taskPriority: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "capitalize",
  },
  goalTag: {
    display: "inline-flex",
    alignItems: "center",
    width: "fit-content",
    maxWidth: "100%",
    padding: "var(--space-1) var(--space-2)",
    border: "1px solid transparent",
    borderRadius: "var(--radius-md)",
    background: "var(--accent-wash)",
    color: "var(--color-accent)",
    fontSize: "var(--type-xs)",
    fontWeight: "var(--font-medium)",
    overflowWrap: "anywhere",
  },
  milestoneTag: {
    display: "inline-flex",
    alignItems: "center",
    width: "fit-content",
    maxWidth: "100%",
    padding: "var(--space-1) var(--space-2)",
    border: "1px solid transparent",
    borderRadius: "var(--radius-md)",
    background: "var(--bg-raised)",
    color: "var(--text-secondary)",
    fontSize: "var(--type-xs)",
    fontWeight: "var(--font-medium)",
    overflowWrap: "anywhere",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    border: "2px solid var(--checkbox-border)",
    background: "transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transition: "all 0.15s ease",
  },
  checkboxChecked: {
    background: "var(--checkbox-checked-bg)",
    borderColor: "var(--checkbox-checked-border)",
    boxShadow: "var(--checkbox-checked-shadow)",
  },
  checkboxHover: {
    borderColor: "var(--checkbox-checked-border)",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "var(--space-3)",
  },
  statCard: {
    padding: "var(--space-3) var(--space-2)",
    borderTop: "1px solid var(--border-color)",
    background: "transparent",
  },
  statLabel: {
    display: "block",
    fontSize: "var(--type-xs)",
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: "var(--space-2)",
  },
  statValue: {
    display: "block",
    fontSize: "var(--type-xl)",
    fontWeight: "var(--font-bold)",
    color: "var(--text-primary)",
    fontVariantNumeric: "tabular-nums",
  },
  statsSection: {
    margin: "var(--space-6) 0",
  },
  statValueAccent: {
    color: "var(--accent-teal)",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: "48px 24px",
    textAlign: "center",
    background: "transparent",
    border: "none",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: "var(--text-primary)",
    margin: 0,
  },
  emptyText: {
    fontSize: 14,
    color: "var(--text-secondary)",
    margin: 0,
  },
  emptyActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 8,
  },
  textButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 0",
    border: "none",
    background: "transparent",
    color: "var(--accent-teal)",
    fontSize: "var(--type-sm)",
    fontWeight: "var(--font-medium)",
    cursor: "pointer",
  },
  focusButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    padding: 0,
    background: "transparent",
    border: "1px solid transparent",
    borderRadius: 6,
    color: "var(--text-muted)",
    cursor: "pointer",
    flexShrink: 0,
    transition: "background 0.15s ease, color 0.15s ease",
  },
  secondaryButton: {
    padding: "8px 12px",
    border: "1px solid var(--border-color)",
    borderRadius: 8,
    background: "transparent",
    color: "var(--text-body)",
    fontSize: 13,
    cursor: "pointer",
  },
  submitButton: {
    padding: "8px 12px",
    border: "1px solid transparent",
    borderRadius: 8,
    background: "var(--color-accent)",
    color: "var(--color-accent-contrast)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  quickActionList: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "var(--space-3)",
    width: "100%",
  },
  quickActionButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    minHeight: 44,
    minWidth: 0,
    padding: "8px 12px",
    background: "transparent",
    border: "1px solid var(--border-color)",
    borderRadius: 8,
    color: "var(--text-body)",
    fontSize: 13,
    textAlign: "center",
    cursor: "pointer",
    transition: "color var(--transition-standard), background-color var(--transition-standard), border-color var(--transition-standard), transform var(--transition-standard)",
  },
  scheduleSection: {
    marginBottom: 32,
  },
  scheduleHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  scheduleTimeSummary: {
    fontSize: "var(--type-sm)",
    color: "var(--text-secondary)",
    fontWeight: 500,
  },
  scheduleTimeline: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-2)",
  },
  scheduleItem: {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-3)",
    padding: "var(--space-3) 0",
    position: "relative",
    borderBottom: "1px solid var(--border-color)",
  },
  scheduleTimeSlot: {
    flexShrink: 0,
    width: 70,
    fontSize: "var(--type-sm)",
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
    color: "var(--accent-teal)",
    textAlign: "right",
  },
  scheduleItemInfo: {
    flex: 1,
    minWidth: 0,
  },
  scheduleItemButton: {
    flex: 1,
    minWidth: 0,
    display: "block",
    padding: 0,
    background: "transparent",
    border: "none",
    color: "inherit",
    font: "inherit",
    textAlign: "left",
    cursor: "pointer",
  },
  scheduleItemTitle: {
    fontSize: "var(--type-base)",
    fontWeight: "var(--font-medium)",
    color: "var(--text-body)",
    margin: "0 0 4px",
  },
  scheduleItemMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: "var(--type-xs)",
    color: "var(--text-secondary)",
  },
  scheduleDuration: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: "var(--type-xs)",
    color: "var(--text-muted)",
  },
  scheduleButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--radius-md)",
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: "var(--type-xs)",
    cursor: "pointer",
  },
  scheduleModal: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "var(--overlay-dim)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  scheduleModalContent: {
    ...CARD_SURFACE,
    maxWidth: 400,
    width: "90%",
    padding: 24,
    maxHeight: "80vh",
    overflowY: "auto",
  },
  scheduleModalTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: "var(--text-primary)",
    margin: "0 0 16px",
  },
  scheduleModalClose: {
    position: "absolute",
    top: 16,
    right: 16,
    background: "transparent",
    border: "none",
    color: "var(--text-secondary)",
    cursor: "pointer",
    padding: 4,
  },
  scheduleForm: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  scheduleFormItem: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  scheduleFormLabel: {
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text-secondary)",
  },
  scheduleFormInput: {
    ...FORM_CONTROL,
  },
  scheduleFormActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 8,
  },
  unscheduledSection: {
    marginTop: 24,
    paddingTop: 16,
    borderTop: "1px solid var(--border-color)",
  },
  // Goal context section (relevant Goals only; rendered by renderGoalProgressSnapshot)
  goalProgressSection: {
    marginBottom: 32,
  },
  goalProgressList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  goalProgressItem: {
    padding: "var(--space-2) 0",
    borderBottom: "1px solid var(--border-color)",
  },
  goalProgressHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  goalProgressTitle: {
    fontSize: 14,
    fontWeight: 500,
    color: "var(--text-body)",
  },
  goalProgressPercent: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--accent-teal)",
  },
  goalProgressBar: {
    height: 6,
    background: "var(--bg-inset)",
    borderRadius: 3,
    overflow: "hidden",
  },
  goalProgressFill: {
    height: "100%",
    background: "var(--accent-teal)",
    transition: "width 0.3s ease",
  },
};

function HabitMetadata({ habit, streak }: { habit: Habit; streak: number }) {
  return (
    <div style={styles.habitMeta}>
      <span
        style={{
          ...styles.priorityBadge,
          ...(habit.priority === "Mandatory"
            ? styles.priorityMandatory
            : styles.priorityOptional),
        }}
      >
        {habit.priority}
      </span>
      {habit.category && <span style={styles.categoryBadge}>{habit.category}</span>}
      <StreakBadge streak={streak} />
    </div>
  );
}

function Today({
  viewMode,
  habits,
  tasks,
  goals,
  milestones,
  projects,
  focusSessions,
  onToggleHabit,
  onToggleTask,
  onAddTask,
  onQuickTaskFocusReady,
  onStartFocus,
  onNavigateToHabits,
  onNavigateToGoals,
  onNavigateToHistory,
  onNavigateToAnalytics,
  streakFreeze,
  dayResetHour,
  showMandatoryHabitsInImportantItems,
  onUpdateHabit,
  onUpdateTask,
}: TodayProps) {
  const todayKey = getTodayKey(dayResetHour);
  const today = useMemo(() => new Date(), []);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [schedulingItem, setSchedulingItem] = useState<{ type: 'habit' | 'task'; id: string | number } | null>(null);
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduleDuration, setScheduleDuration] = useState("");
  
  const todayHabits = useMemo(() => {
    return habits.filter(
      (habit) =>
        !habit.isArchived &&
        habit.type === "Daily" &&
        isHabitScheduledOnDate(habit, todayKey),
    );
  }, [habits, todayKey]);

  const activeGoalIds = useMemo(
    () => new Set(goals.filter((goal) => goal.status === "active").map((goal) => goal.id)),
    [goals],
  );
  const todayTasks = useMemo(
    () => sortTodayTasks(selectTodayTasks(tasks, { milestones, activeGoalIds, todayKey }), todayKey),
    [tasks, milestones, activeGoalIds, todayKey],
  );
  const [quickTaskTitle, setQuickTaskTitle] = useState("");

  // Chronological daily timeline derived from existing scheduledTime /
  // durationMinutes fields plus today's logged Focus sessions (day-reset
  // aware). Rescheduling edits the underlying item; this list rebuilds.
  const timelineBlocks = useMemo(
    () => buildDailyTimeline({
      habits: todayHabits,
      tasks: todayTasks,
      goals,
      milestones,
      projects,
      focusSessions,
      todayKey,
      dayResetHour,
      now: today,
    }),
    [todayHabits, todayTasks, goals, milestones, projects, focusSessions, todayKey, dayResetHour, today],
  );

  const totalPlannedMinutes = useMemo(
    () => sumPlannedMinutes(timelineBlocks),
    [timelineBlocks],
  );

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const pendingTodayTasks = todayTasks.filter((task) => !task.completed);
  const completedTodayTasks = todayTasks.filter((task) => task.completed);

  const quickTaskInputRef = useRef<HTMLInputElement>(null);
  function focusQuickTaskInput() {
    quickTaskInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    quickTaskInputRef.current?.focus({ preventScroll: true });
  }

  // Expose the quick-add focus so the ⌘K palette can reuse this exact input
  // instead of building a second task-creation path.
  useLayoutEffect(() => {
    onQuickTaskFocusReady?.(focusQuickTaskInput);
    return () => onQuickTaskFocusReady?.(null);
  }, [onQuickTaskFocusReady]);

  function handleQuickTaskSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = quickTaskTitle.trim();
    if (!trimmedTitle) return;
    onAddTask({ title: trimmedTitle, dueDate: todayKey, priority: "medium" });
    setQuickTaskTitle("");
  }

  function renderTaskRow(task: Task, completed: boolean) {
    const { goal, project, milestone } = resolveTaskContext(task, { goals, projects, milestones });
    const overdue = !completed && isTaskOverdue(task, todayKey);
    return (
      <div key={task.id} style={styles.habitCard}>
        <button
          type="button"
          style={{ ...styles.checkbox, ...(completed ? styles.checkboxChecked : {}) }}
          onClick={() => onToggleTask(task.id)}
          aria-label={`${completed ? "Mark incomplete" : "Complete"} ${task.title}`}
          aria-checked={completed}
          role="checkbox"
        >
          {completed && <Check size={14} color="var(--color-accent-contrast)" />}
        </button>
        <div style={styles.habitInfo}>
          <h3 style={{ ...styles.taskName, ...(completed ? styles.taskNameCompleted : {}) }}>{task.title}</h3>
          <div style={styles.taskMeta}>
            <span style={styles.taskPriority}>{task.priority}</span>
            {task.dueDate && (
              <time dateTime={task.dueDate} style={overdue ? { color: "var(--priority-high-text)", fontWeight: 600 } : undefined}>
                {overdue ? `Overdue (due ${formatFullDate(task.dueDate)})` : `Due ${formatFullDate(task.dueDate)}`}
              </time>
            )}
            {goal && <span style={styles.goalTag}>{goal.title}</span>}
            {project && <span style={styles.milestoneTag}>{project.name}</span>}
            {milestone && <span style={styles.milestoneTag}>{milestone.title}</span>}
          </div>
        </div>
        <button
          className="today-focus-button"
          style={styles.focusButton}
          onClick={() => onStartFocus({ taskId: task.id, title: task.title })}
          aria-label={`Start Focus on ${task.title}`}
        >
          <Play size={14} />
        </button>
      </div>
    );
  }

  const completedHabitCount = todayHabits.filter((habit) =>
    habit.completedDates.includes(todayKey),
  ).length;
  const completedTaskCount = todayTasks.filter((task) => task.completed).length;
  const completedCount = completedHabitCount + completedTaskCount;
  const totalCount = todayHabits.length + todayTasks.length;
  const progressPercent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  // Day-reset aware: matches the Focus timer's own "today" definition.
  const todayFocusTime = useMemo(() => {
    return getFocusSessionsForLogicalToday(focusSessions, dayResetHour, today)
      .reduce((total, session) => total + session.durationMinutes, 0);
  }, [focusSessions, dayResetHour, today]);

  const bestStreak = useMemo(() => {
    return Math.max(0, ...todayHabits.map((habit) => calculateStreak(habit, streakFreeze, dayResetHour)));
  }, [todayHabits, streakFreeze, dayResetHour]);

  // The single next action: most urgent pending Task (already sorted:
  // overdue → due → priority), else the next incomplete Habit. Mandatory
  // Habits are preferred when the user opts into them as important items.
  const nextUpTask = pendingTodayTasks[0] ?? null;
  const nextUpHabit = useMemo(() => {
    if (nextUpTask) return null;
    const incomplete = todayHabits.filter((habit) => !habit.completedDates.includes(todayKey));
    if (incomplete.length === 0) return null;
    if (showMandatoryHabitsInImportantItems) {
      return incomplete.find((habit) => habit.priority === "Mandatory") ?? incomplete[0];
    }
    return incomplete[0];
  }, [nextUpTask, todayHabits, todayKey, showMandatoryHabitsInImportantItems]);

  // Goal Progress Snapshot
  const activeGoals = useMemo(() => {
    return goals.filter((goal) => goal.status === "active");
  }, [goals]);

  const goalProgressData = useMemo(() => {
    return activeGoals.map((goal) => {
      const progress = calculateGoalProgress(goal, milestones, tasks, habits, streakFreeze, dayResetHour, projects);
      return {
        goal,
        progress,
      };
    });
  }, [activeGoals, milestones, tasks, habits, streakFreeze, dayResetHour, projects]);

  function renderNextUp() {
    if (!nextUpTask && !nextUpHabit) {
      if (totalCount === 0) return null;
      return (
        <div style={styles.nextUp}>
          <div style={styles.nextUpInfo}>
            <p style={styles.eyebrow}>Up Next</p>
            <p style={styles.nextUpClear}>All clear for today. Nicely done.</p>
          </div>
          <div style={styles.nextUpActions}>
            <button type="button" style={styles.secondaryButton} onClick={() => onStartFocus()}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Play size={14} />
                <span>Focus Anyway</span>
              </span>
            </button>
          </div>
        </div>
      );
    }

    if (nextUpTask) {
      const task = nextUpTask;
      const { goal, project, milestone } = resolveTaskContext(task, { goals, projects, milestones });
      const overdue = isTaskOverdue(task, todayKey);
      const context = [goal?.title, project?.name, milestone?.title].filter(
        (part): part is string => part !== undefined && part !== "",
      );
      return (
        <div style={styles.nextUp}>
          <button
            type="button"
            style={styles.checkbox}
            onClick={() => onToggleTask(task.id)}
            aria-label={`Complete ${task.title}`}
            aria-checked={false}
            role="checkbox"
          />
          <div style={styles.nextUpInfo}>
            <p style={styles.eyebrow}>Up Next · Task</p>
            <h2 style={styles.nextUpTitle}>{task.title}</h2>
            <div style={styles.nextUpMeta}>
              <span style={{ textTransform: "capitalize", fontWeight: 600 }}>{task.priority}</span>
              {task.dueDate && (
                <time dateTime={task.dueDate}>
                  {overdue ? `Overdue (due ${formatFullDate(task.dueDate)})` : `Due ${formatFullDate(task.dueDate)}`}
                </time>
              )}
              {context.length > 0 && <span>{context.join(" › ")}</span>}
            </div>
          </div>
          <div style={styles.nextUpActions}>
            <button
              type="button"
              style={styles.submitButton}
              onClick={() => onStartFocus({ taskId: task.id, title: task.title })}
              aria-label={`Start Focus on ${task.title}`}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Play size={14} />
                <span>Focus</span>
              </span>
            </button>
          </div>
        </div>
      );
    }

    const habit = nextUpHabit;
    if (!habit) return null;
    const streak = calculateStreak(habit, streakFreeze, dayResetHour);
    return (
      <div style={styles.nextUp}>
        <button
          type="button"
          style={styles.checkbox}
          onClick={() => onToggleHabit(habit.id, todayKey)}
          aria-label={`Complete habit ${habit.name}`}
          aria-checked={false}
          role="checkbox"
        />
        <div style={styles.nextUpInfo}>
          <p style={styles.eyebrow}>Up Next · Habit</p>
          <h2 style={styles.nextUpTitle}>{habit.name}</h2>
          <div style={styles.nextUpMeta}>
            <span>{habit.priority}</span>
            {habit.category && <span>{habit.category}</span>}
            <StreakBadge streak={streak} />
          </div>
        </div>
        <div style={styles.nextUpActions}>
          <button
            type="button"
            style={styles.submitButton}
            onClick={() => onStartFocus({ habitId: habit.id, title: habit.name })}
            aria-label={`Start Focus on ${habit.name}`}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Play size={14} />
              <span>Focus</span>
            </span>
          </button>
        </div>
      </div>
    );
  }

  function renderGoalProgressSnapshot() {
    // Context, not a second Goals page: only Goals connected to today's work.
    const relevantGoalIds = new Set<string>();
    for (const task of todayTasks) {
      const { goal } = resolveTaskContext(task, { goals, projects, milestones });
      if (goal) {
        relevantGoalIds.add(goal.id);
      } else if (task.goalId) {
        relevantGoalIds.add(task.goalId);
      } else if (task.milestoneId) {
        const milestoneGoalId = milestones.find((item) => item.id === task.milestoneId)?.goalId;
        if (milestoneGoalId) relevantGoalIds.add(milestoneGoalId);
      }
    }
    for (const habit of todayHabits) {
      if (habit.goalId) relevantGoalIds.add(habit.goalId);
    }
    const relevant = goalProgressData.filter(({ goal }) => relevantGoalIds.has(goal.id));
    if (relevant.length === 0) return null;

    return (
      <div style={styles.goalProgressSection}>
        <h2 style={styles.sectionTitle}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Target size={18} />
            <span>Goals in Focus</span>
          </span>
        </h2>
        <div style={styles.goalProgressList}>
          {relevant.map(({ goal, progress }) => (
            <div key={goal.id} style={styles.goalProgressItem}>
              <div style={styles.goalProgressHeader}>
                <span style={styles.goalProgressTitle}>{goal.title}</span>
                <span style={styles.goalProgressPercent}>{progress.percent}%</span>
              </div>
              <div style={styles.goalProgressBar}>
                <div style={{ ...styles.goalProgressFill, width: `${progress.percent}%` }} />
              </div>
            </div>
          ))}
        </div>
        <button type="button" style={styles.textButton} onClick={onNavigateToGoals}>
          Open Goals →
        </button>
      </div>
    );
  }

  function renderTimelineBlock(block: TimelineBlock) {
    if (block.kind === "session") {
      return (
        <div key={block.key} style={styles.scheduleItem}>
          <div style={styles.scheduleTimeSlot}>{block.time}</div>
          <button
            type="button"
            style={styles.scheduleItemButton}
            onClick={() => onStartFocus({
              taskId: block.taskId,
              habitId: block.habitId,
              goalId: block.goalId,
              title: block.title,
            })}
            aria-label={`Start Focus on ${block.title}`}
          >
            <h3 style={styles.scheduleItemTitle}>{block.title}</h3>
            <div style={styles.scheduleItemMeta}>
              <span>Focus Session</span>
            </div>
          </button>
          <div style={styles.scheduleDuration}>
            <Clock size={12} />
            {formatDuration(block.durationMinutes)}
          </div>
        </div>
      );
    }

    const completed = block.completed;
    const kindLabel = block.kind === "task" ? "Task" : "Habit";
    return (
      <div key={block.key} style={styles.scheduleItem}>
        <div style={styles.scheduleTimeSlot}>{block.time}</div>
        <button
          type="button"
          style={{ ...styles.checkbox, ...(completed ? styles.checkboxChecked : {}) }}
          onClick={() => block.kind === "task"
            ? onToggleTask(block.taskId)
            : onToggleHabit(block.habitId, todayKey)}
          aria-label={`${completed ? "Mark incomplete" : "Complete"} ${block.title}`}
          aria-checked={completed}
          role="checkbox"
        >
          {completed && <Check size={14} color="var(--color-accent-contrast)" />}
        </button>
        <button
          type="button"
          style={styles.scheduleItemButton}
          onClick={() => onStartFocus(block.kind === "task"
            ? { taskId: block.taskId, title: block.title }
            : { habitId: block.habitId, title: block.title })}
          aria-label={`Start Focus on ${block.title}`}
        >
          <h3 style={{ ...styles.scheduleItemTitle, ...(completed ? styles.taskNameCompleted : {}) }}>
            {block.title}
          </h3>
          <div style={styles.scheduleItemMeta}>
            <span>{kindLabel}</span>
            {block.meta && <span>· {block.meta}</span>}
            {block.kind === "task" && block.overdue && <span>· Overdue</span>}
          </div>
        </button>
        {block.durationMinutes !== undefined && (
          <div style={styles.scheduleDuration}>
            <Clock size={12} />
            {formatDuration(block.durationMinutes)}
          </div>
        )}
        <button
          type="button"
          style={styles.scheduleButton}
          onClick={() => openScheduleModal(block.kind, block.kind === "task" ? block.taskId : block.habitId)}
          aria-label={`Reschedule ${kindLabel.toLowerCase()}`}
        >
          <MoreVertical size={14} />
        </button>
      </div>
    );
  }

  const openScheduleModal = (type: 'habit' | 'task', id: string | number) => {
    const item = type === 'habit' 
      ? habits.find(h => h.id === id)
      : tasks.find(t => t.id === id);
    
    if (item) {
      setSchedulingItem({ type, id });
      setScheduleTime(item.scheduledTime || "");
      const estimatedMinutes = "estimatedMinutes" in item ? item.estimatedMinutes : undefined;
      setScheduleDuration((item.durationMinutes || estimatedMinutes || 30).toString());
      setScheduleModalOpen(true);
    }
  };

  const closeScheduleModal = () => {
    setScheduleModalOpen(false);
    setSchedulingItem(null);
    setScheduleTime("");
    setScheduleDuration("");
  };

  const handleScheduleSave = () => {
    if (!schedulingItem) return;
    
    const duration = parseInt(scheduleDuration, 10);
    if (schedulingItem.type === 'habit') {
      const habit = habits.find(h => h.id === schedulingItem.id);
      if (habit) {
        onUpdateHabit({
          ...habit,
          scheduledTime: scheduleTime || undefined,
          durationMinutes: scheduleTime ? (Number.isFinite(duration) && duration > 0 ? duration : undefined) : undefined,
        });
      }
    } else {
      const task = tasks.find(t => t.id === schedulingItem.id);
      if (task) {
        onUpdateTask({
          ...task,
          scheduledTime: scheduleTime || undefined,
          durationMinutes: scheduleTime ? (Number.isFinite(duration) && duration > 0 ? duration : undefined) : undefined,
        });
      }
    }
    
    closeScheduleModal();
  };

  if (todayHabits.length === 0 && todayTasks.length === 0 && activeGoals.length === 0) {
    return (
      <div style={styles.page}>
        <div style={styles.header}>
          <h1 style={styles.title}>Today</h1>
          <p style={styles.date}>{formatFullDate(today)}</p>
        </div>

        <div style={styles.emptyState}>
          <p style={styles.emptyTitle}>A quiet day — plan your first win</p>
          <p style={styles.emptyText}>
            Add a task for today, create a habit, or start a focus session.
          </p>
          <form
            style={{ display: "flex", gap: 8, width: "100%", maxWidth: 420 }}
            onSubmit={handleQuickTaskSubmit}
          >
            <input
              style={{ ...styles.scheduleFormInput, flex: 1, minWidth: 0 }}
              value={quickTaskTitle}
              onChange={(event) => setQuickTaskTitle(event.target.value)}
              placeholder="Add a Task for Today"
              aria-label="Add a Task for Today"
              maxLength={120}
            />
            <button type="submit" style={styles.submitButton} disabled={!quickTaskTitle.trim()}>
              Add
            </button>
          </form>
          <div style={styles.emptyActions}>
            <button type="button" style={styles.secondaryButton} onClick={onNavigateToHabits}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Plus size={14} />
                <span>New Habit</span>
              </span>
            </button>
            <button type="button" style={styles.secondaryButton} onClick={() => onStartFocus()}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Play size={14} />
                <span>Start Focus</span>
              </span>
            </button>
            <button type="button" style={styles.textButton} onClick={onNavigateToGoals}>
              Create a goal →
            </button>
          </div>
        </div>
      </div>
    );
  }

  const remainingCount = totalCount - completedCount;
  const overdueCount = pendingTodayTasks.filter((task) => isTaskOverdue(task, todayKey)).length;
  const briefingParts: string[] = [];
  if (overdueCount > 0) briefingParts.push(`${overdueCount} overdue`);
  briefingParts.push(`${pendingTodayTasks.length} tasks open`);
  briefingParts.push(`${todayHabits.length - completedHabitCount} habits left`);
  if (todayFocusTime > 0) briefingParts.push(`${todayFocusTime}m focused`);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Today</h1>
        <p style={styles.date}>{formatFullDate(today)}</p>
        {totalCount > 0 && (
          <p style={styles.briefing}>{briefingParts.join(" · ")}</p>
        )}

        <div style={styles.progressSection}>
          <span style={styles.progressText}>
            {completedCount} / {totalCount} Completed · {progressPercent}%
          </span>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${progressPercent}%`,
              }}
            />
          </div>
        </div>
      </div>

      {renderNextUp()}

      {timelineBlocks.length > 0 && (
        <div style={styles.scheduleSection}>
          <div style={styles.scheduleHeader}>
            <h2 style={styles.sectionTitle}>Scheduled Today</h2>
            <span style={styles.scheduleTimeSummary}>
              {formatDuration(totalPlannedMinutes)} planned
            </span>
          </div>
          <div style={styles.scheduleTimeline}>
            {timelineBlocks.map((block) => renderTimelineBlock(block))}
          </div>
        </div>
      )}

      <div style={styles.section}>
        <p style={styles.eyebrow}>Tasks · {pendingTodayTasks.length} open</p>
        <h2 style={styles.sectionTitle}>Up Next &amp; Tasks</h2>
        <form
          style={{ display: "flex", gap: 8, marginBottom: "var(--space-3)" }}
          onSubmit={handleQuickTaskSubmit}
        >
          <input
            ref={quickTaskInputRef}
            style={{ ...styles.scheduleFormInput, flex: 1, minWidth: 0 }}
            value={quickTaskTitle}
            onChange={(event) => setQuickTaskTitle(event.target.value)}
            placeholder="Add a Task for Today"
            aria-label="Add a Task for Today"
            maxLength={120}
          />
          <button type="submit" style={styles.submitButton} disabled={!quickTaskTitle.trim()}>
            Add
          </button>
        </form>
        <div style={styles.taskList}>
          {pendingTodayTasks.length === 0 && completedTodayTasks.length === 0 && (
            <p style={styles.emptyText}>No tasks for today.</p>
          )}
          {pendingTodayTasks.map((task) => renderTaskRow(task, false))}
        </div>
        {completedTodayTasks.length > 0 && (
          <div style={{ marginTop: "var(--space-3)" }}>
            <h3 style={{ ...styles.sectionTitle, fontSize: "var(--type-sm)" }}>
              Completed ({completedTodayTasks.length})
            </h3>
            <div style={styles.taskList}>
              {completedTodayTasks.map((task) => renderTaskRow(task, true))}
            </div>
          </div>
        )}
      </div>

      <div style={styles.section}>
        <p style={styles.eyebrow}>
          Habits · {todayHabits.length - completedHabitCount} left
        </p>
        <h2 style={styles.sectionTitle}>Today's Habits</h2>
        <div style={viewMode === "grid" ? styles.habitGridList : styles.habitList}>
          {todayHabits.length === 0 ? (
            <p style={styles.emptyText}>No habits scheduled for today.</p>
          ) : todayHabits.map((habit) => {
            const isCompleted = habit.completedDates.includes(todayKey);
            const streak = calculateStreak(habit, streakFreeze, dayResetHour);
            
            return (
              <div
                key={habit.id}
                style={{
                  ...styles.habitCard,
                  ...(viewMode === "grid" ? styles.habitCardGrid : {}),
                  ...(isCompleted ? styles.habitCardCompleted : {}),
                }}
              >
                <button
                  style={{
                    ...styles.checkbox,
                    ...(isCompleted ? styles.checkboxChecked : {}),
                  }}
                  onClick={() => onToggleHabit(habit.id, todayKey)}
                  aria-label={`Toggle ${habit.name}`}
                  aria-checked={isCompleted}
                >
                  {isCompleted && <Check size={14} color="var(--color-accent-contrast)" />}
                </button>
                
                <div style={styles.habitInfo}>
                  <h3
                    style={{
                      ...styles.habitName,
                      ...(isCompleted ? styles.habitNameCompleted : {}),
                    }}
                  >
                    {habit.name}
                  </h3>
                  <HabitMetadata habit={habit} streak={streak} />
                </div>
                <button
                  className="today-focus-button"
                  style={styles.focusButton}
                  onClick={() => onStartFocus({ habitId: habit.id, title: habit.name })}
                  aria-label={`Start Focus on ${habit.name}`}
                >
                  <Play size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <section style={styles.statsSection} aria-labelledby="today-summary-title">
        <h2 id="today-summary-title" style={styles.sectionTitle}>Daily Summary</h2>
        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <span style={styles.statLabel}>Items Completed</span>
            <span className="ui-numeric" style={styles.statValue}>{completedCount}</span>
          </div>
          <div style={styles.statCard}>
            <span style={styles.statLabel}>Highest Streak</span>
            <span className="ui-numeric" style={{ ...styles.statValue, ...styles.statValueAccent }}>{bestStreak}</span>
          </div>
          <div style={styles.statCard}>
            <span style={styles.statLabel}>Today's Focus Time</span>
            <span className="ui-numeric" style={styles.statValue}>{todayFocusTime}m</span>
          </div>
          <div style={styles.statCard}>
            <span style={styles.statLabel}>Remaining Items</span>
            <span className="ui-numeric" style={styles.statValue}>{remainingCount}</span>
          </div>
        </div>
      </section>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Quick Actions</h2>
        <div className="today-quick-action-list" style={styles.quickActionList}>
          <button className="today-quick-action" style={styles.quickActionButton} onClick={focusQuickTaskInput}>
            <Plus size={16} />
            Add Task
          </button>
          <button className="today-quick-action" style={styles.quickActionButton} onClick={() => onStartFocus()}>
            <Play size={16} />
            Start Focus Session
          </button>
          <button className="today-quick-action" style={styles.quickActionButton} onClick={onNavigateToHabits}>
            <ListChecks size={16} />
            Configure Habits
          </button>
          <button className="today-quick-action" style={styles.quickActionButton} onClick={onNavigateToGoals}>
            <Target size={16} />
            Create Goals
          </button>
          <button className="today-quick-action" style={styles.quickActionButton} onClick={onNavigateToHistory}>
            <HistoryIcon size={16} />
            View History
          </button>
          <button className="today-quick-action" style={styles.quickActionButton} onClick={onNavigateToAnalytics}>
            <BarChart3 size={16} />
            Receive Analytics
          </button>
        </div>
      </div>

      {renderGoalProgressSnapshot()}

      {scheduleModalOpen && (
        <div style={styles.scheduleModal} onClick={closeScheduleModal}>
          <div style={styles.scheduleModalContent} onClick={(e) => e.stopPropagation()}>
            <button
              style={styles.scheduleModalClose}
              onClick={closeScheduleModal}
              aria-label="Close"
            >
              <X size={20} />
            </button>
            <h2 style={styles.scheduleModalTitle}>
              Schedule {schedulingItem?.type === 'habit' ? 'Habit' : 'Task'}
            </h2>
            <div style={styles.scheduleForm}>
              <div style={styles.scheduleFormItem}>
                <label style={styles.scheduleFormLabel}>Time (HH:MM)</label>
                <input
                  type="time"
                  style={styles.scheduleFormInput}
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  aria-label="Scheduled Time"
                />
              </div>
              <div style={styles.scheduleFormItem}>
                <label style={styles.scheduleFormLabel}>Duration (Minutes)</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  style={styles.scheduleFormInput}
                  value={scheduleDuration}
                  onChange={(e) => setScheduleDuration(e.target.value)}
                  placeholder="30"
                  aria-label="Duration in Minutes"
                />
              </div>
              <div style={styles.scheduleFormActions}>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={closeScheduleModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  style={styles.submitButton}
                  onClick={handleScheduleSave}
                >
                  Save Schedule
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Today;
