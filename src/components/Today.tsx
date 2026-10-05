import { useMemo, useState, type CSSProperties } from "react";
import { Check, ListChecks, Play, Plus, Clock, MoreVertical, X, Target, History as HistoryIcon, BarChart3 } from "lucide-react";
import { CARD_SURFACE } from "../theme";
import StreakBadge from "./StreakBadge";
import type { FocusSessionRecord, Goal, Habit, Milestone, Task } from "../types";
import {
  getTodayKey,
  isHabitScheduledOnDate,
  calculateStreak,
  formatFullDate,
} from "../utils/dates";
import { calculateGoalProgress } from "../domain/goals";

type TodayProps = {
  viewMode: "grid" | "list";
  habits: Habit[];
  tasks: Task[];
  goals: Goal[];
  milestones: Milestone[];
  focusSessions: FocusSessionRecord[];
  onToggleHabit: (id: number, dateKey?: string) => void;
  onToggleTask: (id: string) => void;
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
    ...CARD_SURFACE,
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
    ...CARD_SURFACE,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: "48px 24px",
    textAlign: "center",
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
  emptyButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    background: "rgba(var(--accent-rgb), 0.1)",
    border: "1px solid rgba(var(--accent-rgb), 0.42)",
    borderRadius: 8,
    padding: "10px 16px",
    fontSize: 14,
    fontWeight: 500,
    color: "var(--accent-teal)",
    cursor: "pointer",
    marginTop: 8,
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
    background: "var(--accent-wash-soft)",
    border: "1px solid var(--accent-border-soft)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: 13,
    textAlign: "center",
    cursor: "pointer",
    transition: "color var(--transition-standard), background-color var(--transition-standard), border-color var(--transition-standard), box-shadow var(--transition-standard), transform var(--transition-standard)",
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
    padding: "10px 14px",
    border: "1px solid var(--card-surface-border)",
    borderRadius: 8,
    background: "var(--card-surface-bg)",
    color: "var(--text-primary)",
    fontSize: 14,
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
  // High Priority Focus section
  prioritySection: {
    marginBottom: 32,
  },
  // Goal Progress Snapshot
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
    background: "linear-gradient(90deg, var(--accent-teal-soft), var(--accent-teal))",
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
  focusSessions,
  onToggleHabit,
  onToggleTask,
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
  const activeMilestoneIds = useMemo(
    () => new Set(milestones
      .filter((milestone) => !milestone.completed && milestone.goalId !== undefined && activeGoalIds.has(milestone.goalId))
      .map((milestone) => milestone.id)),
    [milestones, activeGoalIds],
  );
  const todayTasks = useMemo(
    () => tasks.filter((task) => task.dueDate === todayKey || (task.milestoneId && activeMilestoneIds.has(task.milestoneId))),
    [tasks, todayKey, activeMilestoneIds],
  );

  const scheduledItems = useMemo(() => {
    const items: Array<{ type: 'habit' | 'task'; id: string | number; title: string; time: string; duration?: number; meta?: string }> = [];
    
    todayHabits.forEach(habit => {
      if (habit.scheduledTime) {
        items.push({
          type: 'habit',
          id: habit.id,
          title: habit.name,
          time: habit.scheduledTime,
          duration: habit.durationMinutes,
          meta: habit.category || habit.priority,
        });
      }
    });
    
    todayTasks.forEach(task => {
      if (task.scheduledTime) {
        const milestone = milestones.find((item) => item.id === task.milestoneId);
        const goal = goals.find((item) => item.id === (task.goalId ?? milestone?.goalId));
        items.push({
          type: 'task',
          id: task.id,
          title: task.title,
          time: task.scheduledTime,
          duration: task.durationMinutes || task.estimatedMinutes,
          meta: goal?.title || task.priority,
        });
      }
    });
    
    return items.sort((a, b) => a.time.localeCompare(b.time));
  }, [todayHabits, todayTasks, milestones, goals]);

  const totalPlannedMinutes = useMemo(() => {
    return scheduledItems.reduce((total, item) => total + (item.duration || 0), 0);
  }, [scheduledItems]);

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const pendingTodayTasks = todayTasks.filter((task) => !task.completed);

  const completedHabitCount = todayHabits.filter((habit) =>
    habit.completedDates.includes(todayKey),
  ).length;
  const completedTaskCount = todayTasks.filter((task) => task.completed).length;
  const completedCount = completedHabitCount + completedTaskCount;
  const totalCount = todayHabits.length + todayTasks.length;
  const progressPercent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  const todayFocusTime = useMemo(() => {
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    
    return focusSessions
      .filter((session) => session.timestamp >= todayStart.getTime() && session.timestamp <= todayEnd.getTime())
      .reduce((total, session) => total + session.durationMinutes, 0);
  }, [focusSessions, today]);

  const bestStreak = useMemo(() => {
    return Math.max(0, ...todayHabits.map((habit) => calculateStreak(habit, streakFreeze, dayResetHour)));
  }, [todayHabits, streakFreeze, dayResetHour]);

  // High Priority Focus items
  const highPriorityTasks = useMemo(() => {
    return todayTasks.filter((task) => !task.completed && task.priority === "high");
  }, [todayTasks]);

  const highPriorityHabits = useMemo(() => {
    if (!showMandatoryHabitsInImportantItems) return [];
    return todayHabits.filter((habit) => !habit.completedDates.includes(todayKey) && habit.priority === "Mandatory");
  }, [todayHabits, todayKey, showMandatoryHabitsInImportantItems]);

  // Goal Progress Snapshot
  const activeGoals = useMemo(() => {
    return goals.filter((goal) => goal.status === "active");
  }, [goals]);

  const goalProgressData = useMemo(() => {
    return activeGoals.map((goal) => {
      const progress = calculateGoalProgress(goal, milestones, tasks, habits, streakFreeze, dayResetHour);
      return {
        goal,
        progress,
      };
    });
  }, [activeGoals, milestones, tasks, habits, streakFreeze, dayResetHour]);

  function renderHighPrioritySection() {
    if (highPriorityTasks.length === 0 && highPriorityHabits.length === 0) return null;

    return (
      <div style={styles.prioritySection}>
        <h2 style={styles.sectionTitle}>High Priority Focus</h2>
        <div style={styles.taskList}>
          {highPriorityHabits.map((habit) => {
            const streak = calculateStreak(habit, streakFreeze, dayResetHour);
            return (
              <div key={`priority-habit-${habit.id}`} style={styles.habitCard}>
                <button
                  type="button"
                  style={styles.checkbox}
                  onClick={() => onToggleHabit(habit.id, todayKey)}
                  aria-label={`Complete mandatory habit ${habit.name}`}
                  aria-checked={false}
                  role="checkbox"
                />
                <div style={styles.habitInfo}>
                  <h3 style={styles.taskName}>{habit.name}</h3>
                  <HabitMetadata habit={habit} streak={streak} />
                </div>
                <button
                  className="today-focus-button"
                  style={styles.focusButton}
                  onClick={(event) => {
                    event.stopPropagation();
                    onStartFocus({ habitId: habit.id, title: habit.name });
                  }}
                  aria-label={`Start focus on ${habit.name}`}
                >
                  <Play size={14} />
                </button>
              </div>
            );
          })}
          {highPriorityTasks.map((task) => {
            const milestone = milestones.find((item) => item.id === task.milestoneId);
            const goal = goals.find((item) => item.id === (task.goalId ?? milestone?.goalId));
            return (
              <div key={`priority-task-${task.id}`} style={styles.habitCard}>
                <button
                  type="button"
                  style={styles.checkbox}
                  onClick={() => onToggleTask(task.id)}
                  aria-label={`Complete ${task.title}`}
                  aria-checked={false}
                  role="checkbox"
                />
                <div style={styles.habitInfo}>
                  <h3 style={styles.taskName}>{task.title}</h3>
                  <div style={styles.taskMeta}>
                    <span style={styles.taskPriority}>{task.priority}</span>
                    {task.dueDate && <time dateTime={task.dueDate}>Due {formatFullDate(task.dueDate)}</time>}
                    {goal && <span style={styles.goalTag}>{goal.title}</span>}
                    {milestone && <span style={styles.milestoneTag}>{milestone.title}</span>}
                  </div>
                </div>
                <button
                  className="today-focus-button"
                  style={styles.focusButton}
                  onClick={() => onStartFocus({ taskId: task.id, title: task.title })}
                  aria-label={`Start focus on ${task.title}`}
                >
                  <Play size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderGoalProgressSnapshot() {
    if (goalProgressData.length === 0) return null;

    return (
      <div style={styles.goalProgressSection}>
        <h2 style={styles.sectionTitle}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Target size={18} />
            <span>Goal Progress Snapshot</span>
          </span>
        </h2>
        <div style={styles.goalProgressList}>
          {goalProgressData.map(({ goal, progress }) => (
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
          <p style={styles.emptyTitle}>No habits scheduled for today</p>
          <p style={styles.emptyText}>
            {habits.length === 0
              ? "Create your first habit to get started."
              : "Enjoy your free day or check back tomorrow."}
          </p>
          {habits.length === 0 && (
            <button style={styles.emptyButton} onClick={onNavigateToHabits}>
              <Plus size={16} />
              Create Habit
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Today</h1>
        <p style={styles.date}>{formatFullDate(today)}</p>
        
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

      {renderHighPrioritySection()}

      {scheduledItems.length > 0 && (
        <div style={styles.scheduleSection}>
          <div style={styles.scheduleHeader}>
            <h2 style={styles.sectionTitle}>UP NEXT / SCHEDULED TODAY</h2>
            <span style={styles.scheduleTimeSummary}>
              {formatDuration(totalPlannedMinutes)} planned
            </span>
          </div>
          <div style={styles.scheduleTimeline}>
            {scheduledItems.map((item) => (
              <div key={`${item.type}-${item.id}`} style={styles.scheduleItem}>
                <div style={styles.scheduleTimeSlot}>{item.time}</div>
                <div style={styles.scheduleItemInfo}>
                  <h3 style={styles.scheduleItemTitle}>{item.title}</h3>
                  <div style={styles.scheduleItemMeta}>
                    <span style={{ textTransform: 'capitalize' }}>{item.type}</span>
                    {item.meta && <span>· {item.meta}</span>}
                  </div>
                </div>
                {item.duration && (
                  <div style={styles.scheduleDuration}>
                    <Clock size={12} />
                    {formatDuration(item.duration)}
                  </div>
                )}
                <button
                  style={styles.scheduleButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartFocus(item.type === 'task'
                      ? { taskId: item.id as string, title: item.title }
                      : { habitId: item.id as number, title: item.title });
                  }}
                  aria-label={`Start focus on ${item.type}`}
                >
                  <Play size={14} />
                </button>
                <button
                  style={styles.scheduleButton}
                  onClick={() => openScheduleModal(item.type, item.id)}
                  aria-label={`Schedule ${item.type}`}
                >
                  <MoreVertical size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={styles.section}>
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
                  aria-label={`Start focus on ${habit.name}`}
                >
                  <Play size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Up Next &amp; Tasks</h2>
        <div style={styles.taskList}>
          {pendingTodayTasks.length === 0 && (
            <p style={styles.emptyText}>No pending tasks for today.</p>
          )}
          {pendingTodayTasks.map((task) => {
            const milestone = milestones.find((item) => item.id === task.milestoneId);
            const goal = goals.find((item) => item.id === (task.goalId ?? milestone?.goalId));
            return (
              <div key={task.id} style={styles.habitCard}>
                <button
                  type="button"
                  style={styles.checkbox}
                  onClick={() => onToggleTask(task.id)}
                  aria-label={`Complete ${task.title}`}
                  aria-checked={false}
                  role="checkbox"
                />
                <div style={styles.habitInfo}>
                  <h3 style={styles.taskName}>{task.title}</h3>
                  <div style={styles.taskMeta}>
                    <span style={styles.taskPriority}>{task.priority}</span>
                    {task.dueDate && <time dateTime={task.dueDate}>Due {formatFullDate(task.dueDate)}</time>}
                    {goal && <span style={styles.goalTag}>{goal.title}</span>}
                    {milestone && <span style={styles.milestoneTag}>{milestone.title}</span>}
                  </div>
                </div>
                <button
                  className="today-focus-button"
                  style={styles.focusButton}
                  onClick={() => onStartFocus({ taskId: task.id, title: task.title })}
                  aria-label={`Start focus on ${task.title}`}
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
            <span className="ui-numeric" style={styles.statValue}>{totalCount - completedCount}</span>
          </div>
        </div>
      </section>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Quick Actions</h2>
        <div className="today-quick-action-list" style={styles.quickActionList}>
          <button className="today-quick-action" style={styles.quickActionButton} onClick={onNavigateToHabits}>
            <ListChecks size={16} />
            Configure Habits
          </button>
          <button className="today-quick-action" style={styles.quickActionButton} onClick={() => onStartFocus()}>
            <Play size={16} />
            Start Focus Session
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
                  aria-label="Schedule time"
                />
              </div>
              <div style={styles.scheduleFormItem}>
                <label style={styles.scheduleFormLabel}>Duration (minutes)</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  style={styles.scheduleFormInput}
                  value={scheduleDuration}
                  onChange={(e) => setScheduleDuration(e.target.value)}
                  placeholder="30"
                  aria-label="Duration in minutes"
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
