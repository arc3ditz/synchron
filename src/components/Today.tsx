import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
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
import { listNextStepCandidates, nextStepKey, recommendNextStep, isTaskStaleBacklog } from "../domain/nextStep";
import { getWelcomeBackSubtitle, getWelcomeBackTitle } from "../domain/welcomeBack";
import { COMPLETION_CONFIRMATION_MS, getCompletionMessage } from "../domain/completionFeedback";
import { QUICK_FOCUS_MINUTES } from "../domain/focusTimer";
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
  // Low-friction start for the hero recommendation: links the item on the
  // existing Focus Timer with a short commitment and auto-starts it.
  onQuickFocus: (entity: { taskId?: string; habitId?: number; title?: string; durationMinutes?: number }) => void;
  onNavigateToHabits: () => void;
  onNavigateToGoals: () => void;
  onNavigateToHistory: () => void;
  onNavigateToAnalytics: () => void;
  streakFreeze: boolean;
  dayResetHour: number;
  showMandatoryHabitsInImportantItems: boolean;
  onUpdateHabit: (habit: Habit) => void;
  onUpdateTask: (task: Task) => void;
  // Gentle restart: present only after a meaningful inactivity gap with
  // reliable local activity data. Null falls back to the normal Today view.
  welcomeBack?: { daysAway: number } | null;
};

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: 920,
    width: "100%",
    margin: "0 auto",
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
    alignItems: "flex-start",
    gap: "var(--space-4)",
    padding: "var(--space-4)",
    marginBottom: "var(--space-6)",
    background: "var(--bg-surface)",
    border: "1px solid var(--accent-border-soft)",
    borderRadius: "var(--radius-lg)",
  },
  nextUpEyebrow: {
    fontSize: "var(--type-xs)",
    fontWeight: "var(--font-semibold)",
    color: "var(--color-accent)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    margin: "0 0 var(--space-2)",
  },
  nextUpInfo: {
    flex: 1,
    minWidth: 0,
  },
  nextUpTitle: {
    fontSize: "var(--type-md)",
    fontWeight: "var(--font-semibold)",
    color: "var(--text-primary)",
    margin: "0 0 6px",
    overflowWrap: "anywhere",
  },
  nextUpMeta: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    color: "var(--text-secondary)",
    fontSize: "var(--type-xs)",
  },
  nextUpActions: {
    display: "flex",
    alignItems: "center",
    alignSelf: "center",
    gap: 8,
    flexShrink: 0,
    flexWrap: "wrap",
  },
  nextUpClear: {
    fontSize: "var(--type-sm)",
    color: "var(--text-secondary)",
    margin: "0 0 4px",
  },
  welcomeBack: {
    display: "flex",
    alignItems: "flex-start",
    gap: "var(--space-3)",
    padding: "var(--space-4)",
    marginBottom: "var(--space-4)",
    background: "var(--bg-surface)",
    border: "1px solid var(--border-color)",
    borderRadius: "var(--radius-lg)",
  },
  welcomeBackInfo: {
    flex: 1,
    minWidth: 0,
  },
  welcomeBackTitle: {
    fontSize: "var(--type-md)",
    fontWeight: "var(--font-semibold)",
    color: "var(--text-primary)",
    margin: "0 0 4px",
  },
  welcomeBackText: {
    fontSize: "var(--type-sm)",
    color: "var(--text-secondary)",
    margin: 0,
  },
  // Quiet completion confirmation: one plain line, no animation, no
  // celebration styling. It is event-sourced (see handleTaskToggle /
  // handleHabitToggle) so rerenders alone can never show it twice.
  completionConfirmation: {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-2)",
    padding: "var(--space-2) 0",
    margin: "-var(--space-2) 0 var(--space-4)",
    background: "transparent",
    border: "none",
  },
  completionConfirmationText: {
    flex: 1,
    minWidth: 0,
    fontSize: "var(--type-sm)",
    color: "var(--text-secondary)",
    margin: 0,
    overflowWrap: "anywhere",
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
    fontVariantNumeric: "tabular-nums",
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
    transition: "background-color var(--transition-standard), border-color var(--transition-standard)",
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
    background: "var(--color-category-wash)",
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
  taskChain: {
    margin: "2px 0 0",
    fontSize: 12,
    color: "var(--text-muted)",
    overflowWrap: "anywhere",
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
    color: "var(--text-secondary)",
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
    marginBottom: "var(--space-6)",
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
    marginBottom: "var(--space-6)",
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

function HabitMetadata({ habit, streak, goalTitle }: { habit: Habit; streak: number; goalTitle?: string }) {
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
      {goalTitle && <span style={styles.goalTag}>{goalTitle}</span>}
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
  onQuickFocus,
  onNavigateToHabits,
  onNavigateToGoals,
  onNavigateToHistory,
  onNavigateToAnalytics,
  streakFreeze,
  dayResetHour,
  showMandatoryHabitsInImportantItems,
  onUpdateHabit,
  onUpdateTask,
  welcomeBack = null,
}: TodayProps) {
  const todayKey = getTodayKey(dayResetHour);
  const today = useMemo(() => new Date(), []);
  // Session-only dismissal: hides the calm welcome for this mount without
  // touching goals, habits, tasks, or progress.
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
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

  // Completed tasks drop out of the upcoming schedule the moment they are
  // done; they stay visible under Completed below. Habits keep their slots
  // and logged sessions are history, so only task blocks are filtered here.
  const upcomingTimelineBlocks = useMemo(
    () => timelineBlocks.filter((block) => block.kind !== "task" || !block.completed),
    [timelineBlocks],
  );

  const totalPlannedMinutes = useMemo(
    () => sumPlannedMinutes(upcomingTimelineBlocks),
    [upcomingTimelineBlocks],
  );

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  // One memoized, order-preserving partition of today's already-sorted
  // tasks. Completing a task moves it from pending to completed (and
  // uncompleting moves it back) without re-sorting or refetching, and the
  // stable array identities keep downstream memos (Next Up, counts) from
  // recomputing on unrelated renders.
  // One memoized, order-preserving partition of today's already-sorted
  // tasks. Completing a task moves it from pending to completed (and
  // uncompleting moves it back) without re-sorting or refetching, and the
  // stable array identities keep downstream memos (Next Up, counts) from
  // recomputing on unrelated renders.
  const { pendingTodayTasks, completedTodayTasks } = useMemo(() => {
    const pending: Task[] = [];
    const completed: Task[] = [];
    for (const task of todayTasks) {
      if (task.completed) completed.push(task);
      else pending.push(task);
    }
    return { pendingTodayTasks: pending, completedTodayTasks: completed };
  }, [todayTasks]);

  // Quiet backlog grouping: stale overdue stays fully visible and counted,
  // but collapsed behind one toggle so a large old backlog cannot greet the
  // user as a wall above today's fresh work. Presentation only — ordering,
  // counts, and data are untouched.
  const [showBacklog, setShowBacklog] = useState(false);
  const { freshTodayTasks, backlogTodayTasks } = useMemo(() => {
    const fresh: Task[] = [];
    const backlog: Task[] = [];
    for (const task of pendingTodayTasks) {
      (isTaskStaleBacklog(task, todayKey) ? backlog : fresh).push(task);
    }
    return { freshTodayTasks: fresh, backlogTodayTasks: backlog };
  }, [pendingTodayTasks, todayKey]);

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

  // Single quiet "why" line for a Task: Goal → Project → Milestone in
  // planning-model order, skipping levels the Task has no link to.
  // Returns null when the Task is standalone so the row stays clean.
  function taskChain(task: Task): string | null {
    const { goal, project, milestone } = resolveTaskContext(task, { goals, projects, milestones });
    const parts = [goal?.title, project?.name, milestone?.title].filter(
      (part): part is string => part !== undefined && part !== "",
    );
    return parts.length > 0 ? parts.join(" › ") : null;
  }

  function renderTaskRow(task: Task, completed: boolean) {
    const chain = taskChain(task);
    const overdue = !completed && isTaskOverdue(task, todayKey);
    // Same quiet-backlog treatment as the Tasks page: abandoned work stays
    // visible, but only fresh overdue renders alarming red.
    const stale = !completed && isTaskStaleBacklog(task, todayKey);
    return (
      <div key={task.id} className="today-item" style={styles.habitCard}>
        <button
          type="button"
          className="today-checkbox"
          style={{ ...styles.checkbox, ...(completed ? styles.checkboxChecked : {}) }}
          onClick={() => handleTaskToggle(task, completed)}
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
              <time dateTime={task.dueDate} style={overdue && !stale ? { color: "var(--priority-high-text)", fontWeight: 600 } : stale ? { color: "var(--text-muted)" } : undefined}>
                {stale ? `Backlog since ${formatFullDate(task.dueDate)}` : overdue ? `Overdue (due ${formatFullDate(task.dueDate)})` : `Due ${formatFullDate(task.dueDate)}`}
              </time>
            )}
            {task.scheduledTime && <span>Scheduled {task.scheduledTime}</span>}
          </div>
          {chain && <div style={styles.taskChain}>{chain}</div>}
        </div>
        {!completed && (
          <>
            <button
              className="today-focus-button"
              style={styles.focusButton}
              onClick={() => onStartFocus({ taskId: task.id, title: task.title })}
              aria-label={`Start Focus on ${task.title}`}
              title="Start Focus"
            >
              <Play size={14} />
            </button>
            <button
              type="button"
              style={styles.focusButton}
              onClick={() => openScheduleModal("task", task.id)}
              aria-label={`${task.scheduledTime ? "Reschedule" : "Schedule"} task ${task.title}`}
              title={task.scheduledTime ? "Reschedule" : "Schedule time"}
            >
              <MoreVertical size={14} />
            </button>
          </>
        )}
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

  // The single next action: most urgent pending Task (already sorted:
  // overdue → due → priority), else the next incomplete Habit. Mandatory
  // Habits are preferred when the user opts into them as important items.
  const nextStepBaseInput = useMemo(() => ({
    habits,
    tasks,
    goals,
    milestones,
    projects,
    todayKey,
    preferMandatoryHabits: showMandatoryHabitsInImportantItems,
  }), [habits, tasks, goals, milestones, projects, todayKey, showMandatoryHabitsInImportantItems]);

  // Session-only skip/choice state: no new storage, so skips never persist
  // beyond this mount. Completing, deleting, or invalidating the underlying
  // item refreshes the pick automatically because it derives from props.
  const [skippedTaskIds, setSkippedTaskIds] = useState<string[]>([]);
  const [skippedHabitIds, setSkippedHabitIds] = useState<number[]>([]);
  const [chosenNextStepKey, setChosenNextStepKey] = useState<string | null>(null);

  const { nextStep, nextStepOptions } = useMemo(() => {
    const fallback = {
      kind: "none" as const,
      title: "Next step unavailable",
      reason: "Couldn't load the recommendation. Your tasks and habits are listed below.",
    };
    try {
      const options = listNextStepCandidates(nextStepBaseInput);
      const pinned = chosenNextStepKey
        ? options.find((option) => nextStepKey(option) === chosenNextStepKey) ?? null
        : null;
      if (pinned) return { nextStep: pinned, nextStepOptions: options };
      return {
        nextStep: recommendNextStep({ ...nextStepBaseInput, skippedTaskIds, skippedHabitIds }),
        nextStepOptions: options,
      };
    } catch {
      return { nextStep: fallback, nextStepOptions: [] };
    }
  }, [nextStepBaseInput, chosenNextStepKey, skippedTaskIds, skippedHabitIds]);

  function skipNextStep() {
    if (nextStep.kind === "task") {
      setSkippedTaskIds((current) =>
        current.includes(nextStep.taskId) ? current : [...current, nextStep.taskId],
      );
    } else if (nextStep.kind === "habit") {
      setSkippedHabitIds((current) =>
        current.includes(nextStep.habitId) ? current : [...current, nextStep.habitId],
      );
    }
    setChosenNextStepKey(null);
  }

  // Picking an alternative pins it until it is completed, deleted, or
  // becomes ineligible; choosing a previously skipped item unskips it.
  function chooseNextStep(key: string) {
    setChosenNextStepKey(key);
    if (key.startsWith("task:")) {
      setSkippedTaskIds((current) => current.filter((id) => `task:${id}` !== key));
    } else if (key.startsWith("habit:")) {
      setSkippedHabitIds((current) => current.filter((id) => `habit:${id}` !== key));
    }
  }

  function startNextStep() {
    if (nextStep.kind === "task") {
      onQuickFocus({ taskId: nextStep.taskId, title: nextStep.title, durationMinutes: QUICK_FOCUS_MINUTES });
    } else if (nextStep.kind === "habit") {
      onQuickFocus({ habitId: nextStep.habitId, title: nextStep.title, durationMinutes: QUICK_FOCUS_MINUTES });
    } else {
      onStartFocus();
    }
  }

  function completeNextStep() {
    if (nextStep.kind === "task") {
      const task = tasks.find((item) => item.id === nextStep.taskId);
      // Idempotent guard: a stale recommendation (deleted item) or an
      // already-completed item must never toggle back open, play a phantom
      // sound, or show a completion confirmation for nothing changed.
      if (!task || task.completed) return;
      // The hero only ever recommends incomplete work, so this is always a
      // completion; route through the shared wrapper for the calm confirm.
      handleTaskToggle(task, false);
    } else if (nextStep.kind === "habit") {
      const habit = habits.find((item) => item.id === nextStep.habitId);
      if (!habit || habit.completedDates.includes(todayKey)) return;
      handleHabitToggle(habit, false, todayKey);
    }
  }

  // Single completion path for every Today checkbox (rows, timeline, hero,
  // habit cards). Feedback is event-sourced here — never derived in render —
  // so rerenders alone can never show it twice. Completing replaces any
  // prior confirmation instead of stacking; unmarking clears a confirmation
  // for the same item so a quick complete→uncomplete leaves nothing stale.
  // Sound stays with the existing App handlers (per gesture, settings-aware);
  // Today adds no new sounds.
  const [lastCompletion, setLastCompletion] = useState<{ itemKey: string; message: string } | null>(null);

  // Optimistic-toggle guard: a click's `completed` flag comes from render
  // props, so rapid double-clicks before the store refresh would otherwise
  // toggle twice (complete → reopen) while still showing "Done" and sounding
  // twice. Repeats on the same item are ignored until tasks/habits refresh,
  // which lands within a frame — deliberate unmarking still works the moment
  // the new state arrives.
  const pendingToggleRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    pendingToggleRef.current.clear();
  }, [tasks, habits]);

  useEffect(() => {
    if (lastCompletion === null) return;
    const timerId = window.setTimeout(() => setLastCompletion(null), COMPLETION_CONFIRMATION_MS);
    return () => window.clearTimeout(timerId);
  }, [lastCompletion]);

  function isFinalCompletion(): boolean {
    const openCount = pendingTodayTasks.length + (todayHabits.length - completedHabitCount);
    return openCount <= 1;
  }

  function handleTaskToggle(task: Pick<Task, "id" | "title">, completed: boolean) {
    const itemKey = `task:${task.id}`;
    if (pendingToggleRef.current.has(itemKey)) return;
    pendingToggleRef.current.add(itemKey);
    if (completed) {
      if (lastCompletion?.itemKey === itemKey) setLastCompletion(null);
      onToggleTask(task.id);
      return;
    }
    onToggleTask(task.id);
    setLastCompletion({ itemKey, message: getCompletionMessage(task.title, isFinalCompletion()) });
  }

  function handleHabitToggle(habit: Pick<Habit, "id" | "name">, isCompleted: boolean, dateKey: string) {
    const itemKey = `habit:${habit.id}`;
    if (pendingToggleRef.current.has(itemKey)) return;
    pendingToggleRef.current.add(itemKey);
    if (isCompleted) {
      if (lastCompletion?.itemKey === itemKey) setLastCompletion(null);
      onToggleHabit(habit.id, dateKey);
      return;
    }
    onToggleHabit(habit.id, dateKey);
    setLastCompletion({ itemKey, message: getCompletionMessage(habit.name, isFinalCompletion()) });
  }

  // One quiet line after the hero: what just finished, nothing more. The
  // refreshed hero directly above already carries the next action with its
  // Start button, so no planning step is needed. role="status" announces it
  // politely without stealing focus.
  function renderCompletionConfirmation() {
    if (lastCompletion === null) return null;
    return (
      <div data-testid="completion-confirmation" role="status" style={styles.completionConfirmation}>
        <Check size={14} aria-hidden="true" style={{ flexShrink: 0, color: "var(--text-secondary)" }} />
        <p style={styles.completionConfirmationText}>{lastCompletion.message}</p>
        <button
          type="button"
          style={styles.textButton}
          onClick={() => setLastCompletion(null)}
          aria-label="Dismiss completion message"
        >
          Dismiss
        </button>
      </div>
    );
  }

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

  // One hero card driven by the Next Step engine: title, truthful reason,
  // and duration only when the underlying item actually carries one. Start
  // is the single primary action; completing and skipping are quiet, and a
  // compact picker switches candidates without leaving Today.

  // Calm, non-blocking welcome for a return after inactivity. It never
  // mentions failure, streaks, or falling behind, never gates the Next Step
  // hero or the lists below, and dismisses quietly in-session only.
  function renderWelcomeBack() {
    if (welcomeBack === null || welcomeBack === undefined || welcomeDismissed) return null;
    return (
      <section aria-label="Welcome back" data-testid="welcome-back" style={styles.welcomeBack}>
        <div style={styles.welcomeBackInfo}>
          <h2 style={styles.welcomeBackTitle}>{getWelcomeBackTitle()}</h2>
          <p style={styles.welcomeBackText}>{getWelcomeBackSubtitle()}</p>
        </div>
        <button
          type="button"
          style={styles.textButton}
          onClick={() => setWelcomeDismissed(true)}
          aria-label="Dismiss welcome back message"
        >
          Dismiss
        </button>
      </section>
    );
  }

  function renderNextStep() {
    if (nextStep.kind === "none") {
      if (totalCount === 0) return null;
      return (
        <section aria-label="Next step" aria-live="polite" data-testid="next-step" style={styles.nextUp}>
          <div style={styles.nextUpInfo}>
            <p style={styles.nextUpEyebrow}>Next Step</p>
            <h2 style={styles.nextUpTitle}>All clear for today. Nicely done.</h2>
            <p style={styles.nextUpClear}>{nextStep.reason}</p>
          </div>
          <div style={styles.nextUpActions}>
            <button type="button" style={styles.secondaryButton} onClick={() => onStartFocus()}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Play size={14} />
                <span>Start Focus</span>
              </span>
            </button>
          </div>
        </section>
      );
    }

    const isTask = nextStep.kind === "task";
    const currentKey = nextStepKey(nextStep);
    const linkedTask = isTask ? tasks.find((task) => task.id === nextStep.taskId) : undefined;
    const linkedHabit = !isTask && nextStep.kind === "habit"
      ? habits.find((habit) => habit.id === nextStep.habitId)
      : undefined;
    const chain = linkedTask ? taskChain(linkedTask) : null;
    const streak = linkedHabit ? calculateStreak(linkedHabit, streakFreeze, dayResetHour) : 0;
    const habitGoalTitle = linkedHabit?.goalId
      ? goals.find((goal) => goal.id === linkedHabit.goalId)?.title
      : undefined;
    return (
      <section aria-label="Next step" aria-live="polite" data-testid="next-step" style={styles.nextUp}>
        <div style={styles.nextUpInfo}>
          <p style={styles.nextUpEyebrow}>Next Step · {isTask ? "Task" : "Habit"}</p>
          <h2 style={styles.nextUpTitle}>{nextStep.title}</h2>
          <div style={styles.nextUpMeta}>
            <span>{nextStep.reason}</span>
            {nextStep.durationMinutes !== undefined && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Clock size={12} aria-hidden="true" />
                <span>{nextStep.durationMinutes} min</span>
              </span>
            )}
          </div>
          {chain && <div style={styles.taskChain}>{chain}</div>}
          {!isTask && linkedHabit && (
            <div style={{ ...styles.nextUpMeta, marginTop: 6 }}>
              <span>{linkedHabit.priority}</span>
              {linkedHabit.category && <span>{linkedHabit.category}</span>}
              {habitGoalTitle && <span>{habitGoalTitle}</span>}
              <StreakBadge streak={streak} />
            </div>
          )}
          {nextStepOptions.length > 1 && (
            <div style={{ ...styles.nextUpMeta, marginTop: 8 }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span>Choose another</span>
                <select
                  aria-label="Choose another task or habit"
                  value={currentKey}
                  onChange={(event) => chooseNextStep(event.target.value)}
                  style={{ ...FORM_CONTROL, height: 32, minHeight: 32, fontSize: 12, maxWidth: 240 }}
                >
                  {nextStepOptions.slice(0, 8).map((option) => (
                    <option key={nextStepKey(option)} value={nextStepKey(option)}>
                      {option.kind === "task" ? "Task" : "Habit"}: {option.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>
        <div style={styles.nextUpActions}>
          <button
            type="button"
            style={styles.submitButton}
            onClick={startNextStep}
            aria-label={`Start ${QUICK_FOCUS_MINUTES}-minute focus on ${nextStep.title}`}
            title={`Start a ${QUICK_FOCUS_MINUTES}-minute focus session — the timer stays fully adjustable`}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Play size={14} />
              <span>Start · {QUICK_FOCUS_MINUTES} min</span>
            </span>
          </button>
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={completeNextStep}
            aria-label={`Mark done: ${nextStep.title}`}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Check size={14} />
              <span>Mark Done</span>
            </span>
          </button>
          <button
            type="button"
            style={styles.textButton}
            onClick={skipNextStep}
            aria-label={`Skip for now: ${nextStep.title}`}
          >
            Not now
          </button>
        </div>
      </section>
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
        <p style={styles.eyebrow}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Target size={14} />
            <span>Working toward</span>
          </span>
        </p>
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
            className="today-schedule-focus"
            style={{ ...styles.scheduleItemButton, display: "flex", gap: 8, alignItems: "flex-start" }}
            onClick={() => onStartFocus({
              taskId: block.taskId,
              habitId: block.habitId,
              goalId: block.goalId,
              title: block.title,
            })}
            aria-label={`Start Focus on ${block.title}`}
            title="Start Focus"
          >
            <Play size={13} aria-hidden="true" style={{ flexShrink: 0, marginTop: 3, color: "var(--text-muted)" }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <h3 style={styles.scheduleItemTitle}>{block.title}</h3>
              <div style={styles.scheduleItemMeta}>
                <span>Focus Session</span>
              </div>
            </span>
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
      <div key={block.key} className="today-item" style={styles.scheduleItem}>
        <div style={styles.scheduleTimeSlot}>{block.time}</div>
        <button
          type="button"
          className="today-checkbox"
          style={{ ...styles.checkbox, ...(completed ? styles.checkboxChecked : {}) }}
          onClick={() => block.kind === "task"
            ? handleTaskToggle({ id: block.taskId, title: block.title }, completed)
            : handleHabitToggle({ id: block.habitId, name: block.title }, completed, todayKey)}
          aria-label={`${completed ? "Mark incomplete" : "Complete"} ${block.title}`}
          aria-checked={completed}
          role="checkbox"
        >
          {completed && <Check size={14} color="var(--color-accent-contrast)" />}
        </button>
        <button
          type="button"
          className="today-schedule-focus"
          style={{ ...styles.scheduleItemButton, display: "flex", gap: 8, alignItems: "flex-start" }}
          onClick={() => onStartFocus(block.kind === "task"
            ? { taskId: block.taskId, title: block.title }
            : { habitId: block.habitId, title: block.title })}
          aria-label={`Start Focus on ${block.title}`}
          title="Start Focus"
        >
          <Play size={13} aria-hidden="true" style={{ flexShrink: 0, marginTop: 3, color: "var(--text-muted)" }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ ...styles.scheduleItemTitle, ...(completed ? styles.taskNameCompleted : {}) }}>
              {block.title}
            </h3>
            <div style={styles.scheduleItemMeta}>
              <span>{kindLabel}</span>
              {block.meta && <span>· {block.meta}</span>}
              {block.kind === "task" && block.overdue && <span>· Overdue</span>}
            </div>
          </span>
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

  const overdueCount = pendingTodayTasks.filter((task) => isTaskOverdue(task, todayKey)).length;
  const briefingParts: string[] = [];
  if (overdueCount > 0) briefingParts.push(`${overdueCount} overdue`);
  briefingParts.push(`${pendingTodayTasks.length} Tasks Open`);
  briefingParts.push(`${todayHabits.length - completedHabitCount} Habits Left`);
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
          <span style={styles.progressText} aria-live="polite">
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

      {renderWelcomeBack()}

      {renderNextStep()}

      {renderCompletionConfirmation()}

      {renderGoalProgressSnapshot()}

      <div style={styles.section}>
        <p style={styles.eyebrow}>Tasks · {pendingTodayTasks.length} open</p>
        <h2 style={styles.sectionTitle}>Today&rsquo;s Tasks</h2>
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
            <p style={styles.emptyText}>No tasks for today. Add one small task above whenever you&apos;re ready.</p>
          )}
          {freshTodayTasks.map((task) => renderTaskRow(task, false))}
        </div>
        {backlogTodayTasks.length > 0 && (
          <div style={{ marginTop: "var(--space-3)" }}>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => setShowBacklog((current) => !current)}
              aria-expanded={showBacklog}
              aria-label={`${showBacklog ? "Hide" : "Show"} backlog: ${backlogTodayTasks.length} older overdue ${backlogTodayTasks.length === 1 ? "task" : "tasks"}`}
            >
              {showBacklog ? "Hide backlog" : `Show backlog (${backlogTodayTasks.length})`}
            </button>
            {showBacklog && (
              <div style={{ ...styles.taskList, marginTop: "var(--space-2)" }}>
                {backlogTodayTasks.map((task) => renderTaskRow(task, false))}
              </div>
            )}
          </div>
        )}
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
            <p style={styles.emptyText}>
              No habits scheduled for today.{" "}
              <button type="button" style={styles.textButton} onClick={onNavigateToHabits}>
                Start one small habit →
              </button>
            </p>
          ) : todayHabits.map((habit) => {
            const isCompleted = habit.completedDates.includes(todayKey);
            const streak = calculateStreak(habit, streakFreeze, dayResetHour);
            const habitGoalTitle = habit.goalId
              ? goals.find((goal) => goal.id === habit.goalId)?.title
              : undefined;
            
            return (
              <div
                key={habit.id}
                className="today-item"
                style={{
                  ...styles.habitCard,
                  ...(viewMode === "grid" ? styles.habitCardGrid : {}),
                  ...(isCompleted ? styles.habitCardCompleted : {}),
                }}
              >
                <button
                  className="today-checkbox"
                  style={{
                    ...styles.checkbox,
                    ...(isCompleted ? styles.checkboxChecked : {}),
                  }}
                  onClick={() => handleHabitToggle(habit, isCompleted, todayKey)}
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
                  <HabitMetadata habit={habit} streak={streak} goalTitle={habitGoalTitle} />
                </div>
                {!isCompleted && (
                  <>
                    <button
                      className="today-focus-button"
                      style={styles.focusButton}
                      onClick={() => onStartFocus({ habitId: habit.id, title: habit.name })}
                      aria-label={`Start Focus on ${habit.name}`}
                      title="Start Focus"
                    >
                      <Play size={14} />
                    </button>
                    <button
                      type="button"
                      style={styles.focusButton}
                      onClick={() => openScheduleModal("habit", habit.id)}
                      aria-label={`${habit.scheduledTime ? "Reschedule" : "Schedule"} habit ${habit.name}`}
                      title={habit.scheduledTime ? "Reschedule" : "Schedule time"}
                    >
                      <MoreVertical size={14} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {upcomingTimelineBlocks.length > 0 && (
        <div style={styles.scheduleSection}>
          <div style={styles.scheduleHeader}>
            <h2 style={styles.sectionTitle}>Scheduled Today</h2>
            <span style={styles.scheduleTimeSummary}>
              {formatDuration(totalPlannedMinutes)} planned
            </span>
          </div>
          <div style={styles.scheduleTimeline}>
            {upcomingTimelineBlocks.map((block) => renderTimelineBlock(block))}
          </div>
        </div>
      )}

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

      {scheduleModalOpen && (
        <div style={styles.scheduleModal} onClick={closeScheduleModal}>
          <div
            style={styles.scheduleModalContent}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Schedule"
          >
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
