import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { BarChart3, Check, Clock, History as HistoryIcon, ListChecks, MoreVertical, Play, Plus, X } from "lucide-react";
import StreakBadge from "./StreakBadge";
import type { FocusSessionRecord, Habit, Milestone, Project, Task } from "../types";
import {
  calculateStreak,
  formatFullDate,
  getTodayKey,
  isHabitScheduledOnDate,
} from "../utils/dates";
import { getFocusSessionsForLogicalToday, QUICK_FOCUS_MINUTES } from "../domain/focusTimer";
import { FORM_CONTROL } from "../theme";
import { isTaskStaleBacklog, listNextStepCandidates, nextStepKey, recommendNextStep } from "../domain/nextStep";
import { getWelcomeBackSubtitle, getWelcomeBackTitle } from "../domain/welcomeBack";
import { COMPLETION_CONFIRMATION_MS, getCompletionMessage } from "../domain/completionFeedback";
import { buildDailyTimeline, totalPlannedMinutes as sumPlannedMinutes, type TimelineBlock } from "../domain/timeline";
import { isTaskOverdue, resolveTaskContext, selectTodayTasks, sortTodayTasks } from "../domain/tasks";

type TodayProps = {
  viewMode: "grid" | "list";
  habits: Habit[];
  tasks: Task[];
  milestones: Milestone[];
  projects?: Project[];
  focusSessions: FocusSessionRecord[];
  onToggleHabit: (id: number, dateKey?: string) => void;
  onToggleTask: (id: string) => void;
  onAddTask: (data: Omit<Task, "id" | "createdAt" | "completed">) => void;
  onQuickTaskFocusReady?: (focus: (() => void) | null) => void;
  onStartFocus: (entityId?: { taskId?: string; habitId?: number; projectId?: string; milestoneId?: string; title?: string }) => void;
  // Low-friction start for the hero recommendation: links the item on the
  // existing Focus Timer with a short commitment and auto-starts it.
  onQuickFocus: (entity: { taskId?: string; habitId?: number; title?: string; durationMinutes?: number }) => void;
  onNavigateToHabits: () => void;
  onNavigateToProjects: () => void;
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

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// Atelier hero primary-button recipe (referenced once in renderNextStep).
const styles: Record<string, CSSProperties> = {
  submitButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 22px",
    borderRadius: "var(--radius-pill)",
    border: "1px solid transparent",
    background: "var(--color-accent)",
    color: "var(--color-accent-contrast)",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  completionConfirmation: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 24,
    zIndex: 200,
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "fit-content",
    maxWidth: "min(92vw, 480px)",
    marginInline: "auto",
    padding: "10px 12px 10px 14px",
    borderRadius: "var(--radius-pill)",
    background: "var(--bg-raised)",
    border: "1px solid var(--border-strong)",
    boxShadow: "var(--shadow-popover)",
  },
  completionConfirmationText: {
    flex: 1,
    minWidth: 0,
    margin: 0,
    fontSize: "var(--type-sm)",
    color: "var(--text-body)",
    overflowWrap: "anywhere",
  },
  textButton: {
    border: "none",
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: "var(--type-sm)",
    fontWeight: "var(--font-medium)",
    cursor: "pointer",
    padding: "4px 6px",
  },
};

function HabitMetadata({ habit, streak }: { habit: Habit; streak: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          fontSize: "var(--type-xs)",
          fontWeight: "var(--font-regular)",
          borderRadius: "var(--radius-md)",
          padding: "2px var(--space-2)",
          whiteSpace: "nowrap",
          ...(habit.priority === "Mandatory"
            ? {
                color: "var(--color-accent)",
                background: "var(--accent-wash-soft)",
                border: "1px solid var(--accent-border-soft)",
              }
            : {
                color: "var(--text-muted)",
                background: "var(--color-priority-neutral-wash)",
                border: "1px solid var(--border-color)",
              }),
        }}
      >
        {habit.priority}
      </span>
      {habit.category && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            fontSize: "var(--type-xs)",
            padding: "2px var(--space-2)",
            borderRadius: "var(--radius-md)",
            background: "var(--color-priority-neutral-wash)",
            color: "var(--text-muted)",
            border: "1px solid var(--border-color)",
            whiteSpace: "nowrap",
          }}
        >
          {habit.category}
        </span>
      )}
      {habit.scheduledTime && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--type-xs)", color: "var(--text-muted)" }}>
          <Clock size={12} aria-hidden="true" />
          {habit.scheduledTime}
        </span>
      )}
      <StreakBadge streak={streak} />
    </div>
  );
}

function Today({
  viewMode,
  habits,
  tasks,
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
  onNavigateToProjects,
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
  // touching habits, tasks, or progress.
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [schedulingItem, setSchedulingItem] = useState<{ type: "habit" | "task"; id: string | number } | null>(null);
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

  const todayTasks = useMemo(
    () => sortTodayTasks(selectTodayTasks(tasks, { milestones, todayKey }), todayKey),
    [tasks, milestones, todayKey],
  );
  const [quickTaskTitle, setQuickTaskTitle] = useState("");

  // Chronological daily timeline derived from existing scheduledTime /
  // durationMinutes fields plus today's logged Focus sessions (day-reset
  // aware). Rescheduling edits the underlying item; this list rebuilds.
  const timelineBlocks = useMemo(
    () => buildDailyTimeline({
      habits: todayHabits,
      tasks: todayTasks,
      milestones,
      projects,
      focusSessions,
      todayKey,
      dayResetHour,
      now: today,
    }),
    [todayHabits, todayTasks, milestones, projects, focusSessions, todayKey, dayResetHour, today],
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

  // Single quiet "why" line for a Task: Project → Milestone in
  // planning-model order, skipping levels the Task has no link to.
  // Returns null when the Task is standalone so the row stays clean.
  function taskChain(task: Task): string | null {
    const { project, milestone } = resolveTaskContext(task, { projects, milestones });
    const parts = [project?.name, milestone?.title].filter(
      (part): part is string => part !== undefined && part !== "",
    );
    return parts.length > 0 ? parts.join(" › ") : null;
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
    milestones,
    projects,
    todayKey,
    preferMandatoryHabits: showMandatoryHabitsInImportantItems,
  }), [habits, tasks, milestones, projects, todayKey, showMandatoryHabitsInImportantItems]);

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

  const openScheduleModal = (type: "habit" | "task", id: string | number) => {
    const item = type === "habit"
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
    if (schedulingItem.type === "habit") {
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

  const overdueCount = pendingTodayTasks.filter((task) => isTaskOverdue(task, todayKey)).length;
  const habitsLeft = todayHabits.length - completedHabitCount;
  const dayName = today.toLocaleDateString(undefined, { weekday: "long" });
  const greeting = greetingForHour(today.getHours());

  const briefingParts: string[] = [];
  if (overdueCount > 0) briefingParts.push(`${overdueCount} overdue`);
  briefingParts.push(`${pendingTodayTasks.length} ${pendingTodayTasks.length === 1 ? "task" : "tasks"} open`);
  briefingParts.push(`${habitsLeft} ${habitsLeft === 1 ? "habit" : "habits"} left`);
  if (todayFocusTime > 0) briefingParts.push(`${todayFocusTime}m focused`);

  // viewMode tunes the habits presentation: grid shows two-up compact rows
  // inside the main column, list shows single-column rows. Both stay grouped.
  const habitsGrid = viewMode === "grid" && todayHabits.length > 1;

  function renderWelcomeBack() {
    if (welcomeBack === null || welcomeBack === undefined || welcomeDismissed) return null;
    return (
      <section
        aria-label="Welcome back"
        data-testid="welcome-back"
        className="atelier-group row-card"
        style={{ padding: "var(--space-4)", marginBottom: "var(--space-4)", display: "flex", alignItems: "flex-start", gap: "var(--space-3)" }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: "var(--type-md)", fontWeight: "var(--font-semibold)", color: "var(--text-primary)", margin: "0 0 4px" }}>
            {getWelcomeBackTitle()}
          </h2>
          <p style={{ fontSize: "var(--type-sm)", color: "var(--text-secondary)", margin: 0 }}>
            {getWelcomeBackSubtitle()}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setWelcomeDismissed(true)}
          aria-label="Dismiss welcome back message"
          style={{ border: "none", background: "transparent", color: "var(--color-accent)", fontSize: "var(--type-sm)", fontWeight: "var(--font-medium)", cursor: "pointer", padding: "4px 0" }}
        >
          Dismiss
        </button>
      </section>
    );
  }

  // Hero "Up next" panel: one featured recommendation with a large ring
  // checkbox, truthful reason, and duration only when the item carries one.
  function renderNextStep() {
    if (nextStep.kind === "none") {
      if (totalCount === 0) return null;
      return (
        <section
          aria-label="Next step"
          aria-live="polite"
          data-testid="next-step"
          className="atelier-group row-card"
          style={{ padding: "var(--space-5)", marginBottom: "var(--space-5)", display: "flex", alignItems: "center", gap: "var(--space-4)", flexWrap: "wrap" }}
        >
          <div style={{ flex: 1, minWidth: 220 }}>
            <p style={{ fontSize: "var(--type-xs)", fontWeight: "var(--font-semibold)", color: "var(--color-accent)", textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 6px" }}>
              Up next
            </p>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.4rem, 3vw, 1.9rem)", fontWeight: 500, letterSpacing: "-0.01em", color: "var(--text-primary)", margin: "0 0 6px" }}>
              All clear for today. Nicely done.
            </h2>
            <p style={{ fontSize: "var(--type-sm)", color: "var(--text-secondary)", margin: 0 }}>{nextStep.reason}</p>
          </div>
          <button
            type="button"
            onClick={() => onStartFocus()}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 22px", borderRadius: "var(--radius-pill)", border: "1px solid transparent", background: "var(--color-accent)", color: "var(--color-accent-contrast)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >
            <Play size={15} aria-hidden="true" />
            Start focus
          </button>
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
    const heroCompleted = false;

    return (
      <section
        aria-label="Next step"
        aria-live="polite"
        data-testid="next-step"
        className="atelier-group row-card"
        style={{ padding: "clamp(20px, 3vw, 32px)", marginBottom: "var(--space-5)", display: "flex", alignItems: "flex-start", gap: "var(--space-4)" }}
      >
        <button
          type="button"
          className="today-checkbox"
          onClick={completeNextStep}
          aria-label={`Mark done: ${nextStep.title}`}
          aria-checked={heroCompleted}
          role="checkbox"
          title="Mark done"
        >
          <Check size={15} aria-hidden="true" />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: "var(--type-xs)", fontWeight: "var(--font-semibold)", color: "var(--color-accent)", textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 6px" }}>
            Up next · {isTask ? "Task" : "Habit"}
          </p>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.4rem, 3vw, 1.9rem)", fontWeight: 500, letterSpacing: "-0.01em", lineHeight: 1.15, color: "var(--text-primary)", margin: "0 0 8px", overflowWrap: "anywhere" }}>
            {nextStep.title}
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: "var(--type-sm)", color: "var(--text-secondary)" }}>
            <span>{nextStep.reason}</span>
            {nextStep.durationMinutes !== undefined && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--type-xs)", color: "var(--text-muted)" }}>
                <Clock size={12} aria-hidden="true" />
                {nextStep.durationMinutes} min
              </span>
            )}
            {!isTask && linkedHabit && (
              <span className="streak-pill">
                {streak}-day streak
              </span>
            )}
          </div>
          {chain && (
            <p style={{ margin: "6px 0 0", fontSize: "var(--type-xs)", color: "var(--text-muted)", overflowWrap: "anywhere" }}>
              {chain}
            </p>
          )}
          {nextStepOptions.length > 1 && (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: "var(--type-xs)", color: "var(--text-muted)" }}>
              <span>Choose another</span>
              <select
                aria-label="Choose another task or habit"
                value={currentKey}
                onChange={(event) => chooseNextStep(event.target.value)}
                style={{ ...FORM_CONTROL, height: 32, minHeight: 32, padding: "4px 10px", fontSize: 12, borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", background: "var(--bg-inset)", color: "var(--text-body)", maxWidth: 240 }}
              >
                {nextStepOptions.slice(0, 8).map((option) => (
                  <option key={nextStepKey(option)} value={nextStepKey(option)}>
                    {option.kind === "task" ? "Task" : "Habit"}: {option.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={startNextStep}
              aria-label={`Start ${QUICK_FOCUS_MINUTES}-minute focus on ${nextStep.title}`}
              title={`Start a ${QUICK_FOCUS_MINUTES}-minute focus session — the timer stays fully adjustable`}
              style={{ ...styles.submitButton, color: "var(--color-accent-contrast)" }}
            >
              <Play size={15} aria-hidden="true" />
              Start · {QUICK_FOCUS_MINUTES} min focus
            </button>
            <button
              type="button"
              onClick={skipNextStep}
              aria-label={`Skip for now: ${nextStep.title}`}
              style={{ display: "inline-flex", alignItems: "center", padding: "12px 18px", borderRadius: "var(--radius-pill)", border: "1px solid var(--border-strong)", background: "transparent", color: "var(--text-secondary)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              Not now
            </button>
          </div>
        </div>
      </section>
    );
  }

  // One quiet toast after the hero: what just finished, nothing more.
  // role="status" announces it politely without stealing focus.
  function renderCompletionConfirmation() {
    if (lastCompletion === null) return null;
    return (
      <div
        data-testid="completion-confirmation"
        role="status"
        style={styles.completionConfirmation}
      >
        <Check size={14} aria-hidden="true" style={{ flexShrink: 0, color: "var(--color-accent)" }} />
        <p style={styles.completionConfirmationText}>{lastCompletion.message}</p>
        <button
          type="button"
          onClick={() => setLastCompletion(null)}
          aria-label="Dismiss completion message"
          style={styles.textButton}
        >
          Dismiss
        </button>
      </div>
    );
  }

  function renderTaskRow(task: Task, completed: boolean) {
    const chain = taskChain(task);
    const overdue = !completed && isTaskOverdue(task, todayKey);
    // Same quiet-backlog treatment as the Tasks page: abandoned work stays
    // visible, but only fresh overdue renders alarming red.
    const stale = !completed && isTaskStaleBacklog(task, todayKey);
    return (
      <div
        key={task.id}
        className="today-item row-item"
        style={overdue && !stale ? { borderLeft: "2px solid var(--priority-high-text)" } : undefined}
      >
        <button
          type="button"
          className="today-checkbox"
          onClick={() => handleTaskToggle(task, completed)}
          aria-label={`${completed ? "Mark incomplete" : "Complete"} ${task.title}`}
          aria-checked={completed}
          role="checkbox"
        >
          {completed && <Check size={14} aria-hidden="true" />}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            title={task.title}
            style={{
              margin: "0 0 4px",
              fontSize: "var(--type-base)",
              fontWeight: 600,
              color: completed ? "var(--text-dim)" : "var(--text-body)",
              textDecoration: completed ? "line-through" : "none",
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflowWrap: "anywhere",
            }}
          >
            {task.title}
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: "var(--type-xs)", color: "var(--text-secondary)" }}>
            <span style={{ textTransform: "capitalize", fontWeight: 600 }}>{task.priority}</span>
            {task.dueDate && (
              <time
                dateTime={task.dueDate}
                style={overdue && !stale
                  ? { color: "var(--priority-high-text)", fontWeight: 700 }
                  : stale
                    ? { color: "var(--text-muted)" }
                    : undefined}
              >
                {stale ? `Backlog since ${formatFullDate(task.dueDate)}` : overdue ? `Overdue · due ${formatFullDate(task.dueDate)}` : `Due ${formatFullDate(task.dueDate)}`}
              </time>
            )}
            {task.scheduledTime && <span>Scheduled {task.scheduledTime}</span>}
          </div>
          {chain && (
            <p style={{ margin: "2px 0 0", fontSize: "var(--type-xs)", color: "var(--text-muted)", overflowWrap: "anywhere" }}>
              {chain}
            </p>
          )}
        </div>
        {!completed && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <button
              type="button"
              className="today-focus-button"
              onClick={() => onStartFocus({ taskId: task.id, title: task.title })}
              aria-label={`Start Focus on ${task.title}`}
              title="Start Focus"
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, padding: 0, background: "transparent", border: "1px solid transparent", borderRadius: "var(--radius-md)", color: "var(--text-secondary)", cursor: "pointer" }}
            >
              <Play size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => openScheduleModal("task", task.id)}
              aria-label={`${task.scheduledTime ? "Reschedule" : "Schedule"} task ${task.title}`}
              title={task.scheduledTime ? "Reschedule" : "Schedule time"}
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, padding: 0, background: "transparent", border: "1px solid transparent", borderRadius: "var(--radius-md)", color: "var(--text-secondary)", cursor: "pointer" }}
            >
              <MoreVertical size={14} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderTimelineBlock(block: TimelineBlock) {
    if (block.kind === "session") {
      return (
        <div key={block.key} className="row-item" style={{ padding: "10px 0" }}>
          <span style={{ flexShrink: 0, width: 64, fontSize: "var(--type-sm)", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--color-accent)", textAlign: "right" }}>
            {block.time}
          </span>
          <button
            type="button"
            className="today-schedule-focus"
            onClick={() => onStartFocus({ taskId: block.taskId, habitId: block.habitId, title: block.title })}
            aria-label={`Start Focus on ${block.title}`}
            title="Start Focus"
            style={{ flex: 1, minWidth: 0, display: "block", padding: 0, background: "transparent", border: "none", color: "inherit", font: "inherit", textAlign: "left", cursor: "pointer" }}
          >
            <span style={{ display: "block", fontSize: "var(--type-sm)", fontWeight: "var(--font-medium)", color: "var(--text-body)", overflowWrap: "anywhere" }}>
              {block.title}
            </span>
            <span style={{ display: "block", fontSize: "var(--type-xs)", color: "var(--text-muted)" }}>
              Focus Session · {formatDuration(block.durationMinutes)}
            </span>
          </button>
        </div>
      );
    }

    const completed = block.completed;
    const kindLabel = block.kind === "task" ? "Task" : "Habit";
    return (
      <div key={block.key} className="today-item row-item" style={{ padding: "10px 0" }}>
        <span style={{ flexShrink: 0, width: 64, fontSize: "var(--type-sm)", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--color-accent)", textAlign: "right" }}>
          {block.time}
        </span>
        <button
          type="button"
          className="today-checkbox"
          onClick={() => block.kind === "task"
            ? handleTaskToggle({ id: block.taskId, title: block.title }, completed)
            : handleHabitToggle({ id: block.habitId, name: block.title }, completed, todayKey)}
          aria-label={`${completed ? "Mark incomplete" : "Complete"} ${block.title}`}
          aria-checked={completed}
          role="checkbox"
        >
          {completed && <Check size={14} aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="today-schedule-focus"
          onClick={() => onStartFocus(block.kind === "task"
            ? { taskId: block.taskId, title: block.title }
            : { habitId: block.habitId, title: block.title })}
          aria-label={`Start Focus on ${block.title}`}
          title="Start Focus"
          style={{ flex: 1, minWidth: 0, display: "block", padding: 0, background: "transparent", border: "none", color: "inherit", font: "inherit", textAlign: "left", cursor: "pointer" }}
        >
          <span style={{
            display: "block",
            fontSize: "var(--type-sm)",
            fontWeight: "var(--font-medium)",
            color: completed ? "var(--text-dim)" : "var(--text-body)",
            textDecoration: completed ? "line-through" : "none",
            overflowWrap: "anywhere",
          }}>
            {block.title}
          </span>
          <span style={{ display: "block", fontSize: "var(--type-xs)", color: "var(--text-muted)" }}>
            {kindLabel}{block.meta ? ` · ${block.meta}` : ""}{block.kind === "task" && block.overdue ? " · Overdue" : ""}{block.durationMinutes !== undefined ? ` · ${formatDuration(block.durationMinutes)}` : ""}
          </span>
        </button>
        <button
          type="button"
          onClick={() => openScheduleModal(block.kind, block.kind === "task" ? block.taskId : block.habitId)}
          aria-label={`Reschedule ${kindLabel.toLowerCase()}`}
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, padding: 0, background: "transparent", border: "1px solid transparent", borderRadius: "var(--radius-md)", color: "var(--text-secondary)", cursor: "pointer", flexShrink: 0 }}
        >
          <MoreVertical size={14} aria-hidden="true" />
        </button>
      </div>
    );
  }

  function renderScheduleModal() {
    if (!scheduleModalOpen) return null;
    return (
      <div
        className="modal-overlay"
        onClick={closeScheduleModal}
        style={{ position: "fixed", inset: 0, zIndex: 100, display: "grid", placeItems: "center", padding: 20, background: "var(--overlay-dim)" }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Schedule"
          onClick={(e) => e.stopPropagation()}
          style={{ position: "relative", width: "min(100%, 440px)", maxHeight: "80vh", overflowY: "auto", padding: 24, background: "var(--bg-surface)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-xl)" }}
        >
          <button
            onClick={closeScheduleModal}
            aria-label="Close"
            style={{ position: "absolute", top: 16, right: 16, background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: 4 }}
          >
            <X size={20} aria-hidden="true" />
          </button>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 16px" }}>
            Schedule {schedulingItem?.type === "habit" ? "Habit" : "Task"}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Time (HH:MM)</label>
              <input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                aria-label="Scheduled Time"
                style={{ minHeight: 40, padding: "8px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", background: "var(--bg-inset)", color: "var(--text-body)", fontSize: 14 }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Duration (Minutes)</label>
              <input
                type="number"
                min={1}
                step={1}
                value={scheduleDuration}
                onChange={(e) => setScheduleDuration(e.target.value)}
                placeholder="30"
                aria-label="Duration in Minutes"
                style={{ minHeight: 40, padding: "8px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", background: "var(--bg-inset)", color: "var(--text-body)", fontSize: 14 }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <button
                type="button"
                onClick={closeScheduleModal}
                style={{ padding: "8px 12px", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", background: "transparent", color: "var(--text-body)", fontSize: 13, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleScheduleSave}
                style={{ padding: "8px 12px", border: "1px solid transparent", borderRadius: "var(--radius-md)", background: "var(--color-accent)", color: "var(--color-accent-contrast)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Save Schedule
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (todayHabits.length === 0 && todayTasks.length === 0) {
    return (
      <div>
        <style>{`.today-atelier-grid{display:grid;gap:var(--space-5);grid-template-columns:minmax(0,1fr)}@media(min-width:960px){.today-atelier-grid{grid-template-columns:minmax(0,1fr) 320px}}`}</style>
        <header className="page-head">
          <p style={{ fontSize: "var(--type-xs)", fontWeight: "var(--font-semibold)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.14em", margin: "0 0 8px" }}>
            {formatFullDate(today)}
          </p>
          <h1 style={{ fontFamily: "var(--font-display)" }}>{greeting}, it&rsquo;s {dayName}</h1>
          <p>A quiet day with nothing due. Begin with one small win.</p>
        </header>

        <div className="today-atelier-grid">
          <section aria-label="Get started" className="atelier-group row-card" style={{ padding: "clamp(20px, 3vw, 32px)", textAlign: "center" }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.4rem", fontWeight: 500, color: "var(--text-primary)", margin: "0 0 8px" }}>
              A quiet day — plan your first win
            </h2>
            <p style={{ fontSize: "var(--type-sm)", color: "var(--text-secondary)", margin: "0 0 20px" }}>
              Add a task for today, create a habit, or start a focus session.
            </p>
            <form
              onSubmit={handleQuickTaskSubmit}
              style={{ display: "flex", gap: 8, width: "100%", maxWidth: 420, margin: "0 auto 16px" }}
            >
              <input
                ref={quickTaskInputRef}
                value={quickTaskTitle}
                onChange={(event) => setQuickTaskTitle(event.target.value)}
                placeholder="Add a Task for Today"
                aria-label="Add a Task for Today"
                maxLength={120}
                style={{ flex: 1, minWidth: 0, minHeight: 40, padding: "8px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", background: "var(--bg-inset)", color: "var(--text-body)", fontSize: 14 }}
              />
              <button
                type="submit"
                disabled={!quickTaskTitle.trim()}
                style={{ padding: "8px 16px", border: "1px solid transparent", borderRadius: "var(--radius-pill)", background: "var(--color-accent)", color: "var(--color-accent-contrast)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >
                Add
              </button>
            </form>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={onNavigateToHabits}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", border: "1px solid var(--border-color)", borderRadius: "var(--radius-pill)", background: "transparent", color: "var(--text-body)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                <Plus size={14} aria-hidden="true" />
                New Habit
              </button>
              <button
                type="button"
                onClick={() => onStartFocus()}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", border: "1px solid var(--border-color)", borderRadius: "var(--radius-pill)", background: "transparent", color: "var(--text-body)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                <Play size={14} aria-hidden="true" />
                Start Focus
              </button>
              <button
                type="button"
                onClick={onNavigateToProjects}
                style={{ border: "none", background: "transparent", color: "var(--color-accent)", fontSize: "var(--type-sm)", fontWeight: "var(--font-medium)", cursor: "pointer" }}
              >
                Open Projects →
              </button>
            </div>
          </section>
          <aside aria-label="Fresh start actions" className="atelier-group row-card" style={{ padding: "var(--space-4)" }}>
            <h2 style={{ fontSize: "var(--type-xs)", fontWeight: "var(--font-semibold)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 12px" }}>
              Explore Synchron
            </h2>
            <div className="today-quick-action-list" style={{ display: "flex", flexWrap: "wrap", gap: "6px 8px" }}>
              <button type="button" onClick={onNavigateToHabits} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: "var(--radius-pill)", border: "1px solid var(--border-color)", background: "transparent", color: "var(--text-muted)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <ListChecks size={13} aria-hidden="true" />
                Configure Habits
              </button>
              <button type="button" onClick={onNavigateToHistory} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: "var(--radius-pill)", border: "1px solid var(--border-color)", background: "transparent", color: "var(--text-muted)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <HistoryIcon size={13} aria-hidden="true" />
                View History
              </button>
              <button type="button" onClick={onNavigateToAnalytics} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: "var(--radius-pill)", border: "1px solid var(--border-color)", background: "transparent", color: "var(--text-muted)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <BarChart3 size={13} aria-hidden="true" />
                Receive Analytics
              </button>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  const ringRadius = 26;
  const ringCircumference = 2 * Math.PI * ringRadius;

  return (
    <div>
      <style>{`.today-atelier-grid{display:grid;gap:var(--space-5);grid-template-columns:minmax(0,1fr)}@media(min-width:960px){.today-atelier-grid{grid-template-columns:minmax(0,1fr) 320px}}.today-habits-grid{display:grid;gap:0;grid-template-columns:minmax(0,1fr)}@media(min-width:640px){.today-habits-grid.is-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.today-habits-grid.is-grid .row-item{border-top:1px solid var(--border-color)}}`}</style>

      <header className="page-head">
        <p style={{ fontSize: "var(--type-xs)", fontWeight: "var(--font-semibold)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.14em", margin: "0 0 8px" }}>
          {formatFullDate(today)}
        </p>
        <h1 style={{ fontFamily: "var(--font-display)" }}>{greeting}, it&rsquo;s {dayName}</h1>
        <p>{briefingParts.join(" · ")}</p>
      </header>

      {renderWelcomeBack()}

      {renderNextStep()}

      {renderCompletionConfirmation()}

      <div className="today-atelier-grid">
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
          <section aria-label="Today's habits" className="atelier-group">
            <p style={{ fontSize: "var(--type-xs)", fontWeight: "var(--font-semibold)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 4px" }}>
              Habits · {habitsLeft} left
            </p>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem", fontWeight: 500, color: "var(--text-primary)", margin: "0 0 12px" }}>
              Today's Habits
            </h2>
            {todayHabits.length === 0 ? (
              <div className="row-card" style={{ padding: "var(--space-4)", textAlign: "center" }}>
                <p style={{ fontSize: "var(--type-sm)", color: "var(--text-secondary)", margin: "0 0 12px" }}>
                  No habits scheduled for today.
                </p>
                <button
                  type="button"
                  onClick={onNavigateToHabits}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: "var(--radius-pill)", border: "1px solid transparent", background: "var(--color-accent)", color: "var(--color-accent-contrast)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                >
                  <Plus size={14} aria-hidden="true" />
                  Start one small habit →
                </button>
              </div>
            ) : (
              <div className={`row-card today-habits-grid${habitsGrid ? " is-grid" : ""}`}>
                {todayHabits.map((habit) => {
                  const isCompleted = habit.completedDates.includes(todayKey);
                  const streak = calculateStreak(habit, streakFreeze, dayResetHour);
                  return (
                    <div
                      key={habit.id}
                      className="today-item row-item"
                      style={isCompleted ? { background: "var(--bg-completed)" } : undefined}
                    >
                      <button
                        type="button"
                        className="today-checkbox"
                        onClick={() => handleHabitToggle(habit, isCompleted, todayKey)}
                        aria-label={`Toggle ${habit.name}`}
                        aria-checked={isCompleted}
                        role="checkbox"
                      >
                        {isCompleted && <Check size={14} aria-hidden="true" />}
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3
                          title={habit.name}
                          style={{
                            margin: "0 0 6px",
                            fontSize: "var(--type-base)",
                            fontWeight: 600,
                            color: isCompleted ? "var(--text-dim)" : "var(--text-body)",
                            textDecoration: isCompleted ? "line-through" : "none",
                            overflow: "hidden",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflowWrap: "anywhere",
                          }}
                        >
                          {habit.name}
                        </h3>
                        <HabitMetadata habit={habit} streak={streak} />
                      </div>
                      {!isCompleted && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                          <button
                            type="button"
                            className="today-focus-button"
                            onClick={() => onStartFocus({ habitId: habit.id, title: habit.name })}
                            aria-label={`Start Focus on ${habit.name}`}
                            title="Start Focus"
                            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, padding: 0, background: "transparent", border: "1px solid transparent", borderRadius: "var(--radius-md)", color: "var(--text-secondary)", cursor: "pointer" }}
                          >
                            <Play size={14} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openScheduleModal("habit", habit.id)}
                            aria-label={`${habit.scheduledTime ? "Reschedule" : "Schedule"} habit ${habit.name}`}
                            title={habit.scheduledTime ? "Reschedule" : "Schedule time"}
                            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, padding: 0, background: "transparent", border: "1px solid transparent", borderRadius: "var(--radius-md)", color: "var(--text-secondary)", cursor: "pointer" }}
                          >
                            <MoreVertical size={14} aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section aria-label="Today's tasks" className="atelier-group">
            <p style={{ fontSize: "var(--type-xs)", fontWeight: "var(--font-semibold)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 4px" }}>
              Tasks · {pendingTodayTasks.length} open
            </p>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem", fontWeight: 500, color: "var(--text-primary)", margin: "0 0 12px" }}>
              Today&rsquo;s Tasks
            </h2>
            <div className="row-card">
              <form onSubmit={handleQuickTaskSubmit} className="row-item" style={{ gap: 8 }}>
                <Plus size={15} aria-hidden="true" style={{ flexShrink: 0, color: "var(--text-muted)" }} />
                <input
                  ref={quickTaskInputRef}
                  value={quickTaskTitle}
                  onChange={(event) => setQuickTaskTitle(event.target.value)}
                  placeholder="Add a Task for Today"
                  aria-label="Add a Task for Today"
                  maxLength={120}
                  style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", color: "var(--text-body)", fontSize: "var(--type-sm)", outline: "none" }}
                />
                <button
                  type="submit"
                  disabled={!quickTaskTitle.trim()}
                  style={{ padding: "7px 14px", border: "1px solid transparent", borderRadius: "var(--radius-pill)", background: "var(--color-accent)", color: "var(--color-accent-contrast)", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: quickTaskTitle.trim() ? 1 : 0.5 }}
                >
                  Add
                </button>
              </form>
              {pendingTodayTasks.length === 0 && completedTodayTasks.length === 0 && (
                <div className="row-item">
                  <p style={{ fontSize: "var(--type-sm)", color: "var(--text-secondary)", margin: 0 }}>
                    No tasks for today. Add one small task above whenever you&rsquo;re ready.
                  </p>
                </div>
              )}
              {freshTodayTasks.map((task) => renderTaskRow(task, false))}
              {backlogTodayTasks.length > 0 && (
                <div className="row-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setShowBacklog((current) => !current)}
                    aria-expanded={showBacklog}
                    aria-label={`${showBacklog ? "Hide" : "Show"} backlog: ${backlogTodayTasks.length} older overdue ${backlogTodayTasks.length === 1 ? "task" : "tasks"}`}
                    style={{ alignSelf: "flex-start", padding: "7px 14px", border: "1px solid var(--border-color)", borderRadius: "var(--radius-pill)", background: "transparent", color: "var(--text-body)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    {showBacklog ? "Hide backlog" : `Show backlog (${backlogTodayTasks.length})`}
                  </button>
                  {showBacklog && (
                    <div className="row-card">
                      {backlogTodayTasks.map((task) => renderTaskRow(task, false))}
                    </div>
                  )}
                </div>
              )}
              {completedTodayTasks.length > 0 && (
                <>
                  <div className="row-item" style={{ paddingTop: 14, paddingBottom: 6 }}>
                    <h3 style={{ margin: 0, fontSize: "var(--type-xs)", fontWeight: "var(--font-semibold)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                      Completed ({completedTodayTasks.length})
                    </h3>
                  </div>
                  {completedTodayTasks.map((task) => renderTaskRow(task, true))}
                </>
              )}
            </div>
          </section>
        </div>

        <aside aria-label="Today overview" style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <section aria-label="Progress" className="atelier-group row-card" style={{ padding: "var(--space-4)", display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
            <svg width="72" height="72" viewBox="0 0 72 72" role="img" aria-label={`${progressPercent}% complete`}>
              <circle cx="36" cy="36" r={ringRadius} fill="none" stroke="var(--bg-inset)" strokeWidth="7" />
              <circle
                cx="36"
                cy="36"
                r={ringRadius}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringCircumference * (1 - progressPercent / 100)}
                transform="rotate(-90 36 36)"
              />
              <text x="36" y="36" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="700" fill="var(--text-primary)">
                {progressPercent}%
              </text>
            </svg>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: "0 0 2px", fontSize: "var(--type-sm)", fontWeight: 600, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                {completedCount} / {totalCount} done
              </p>
              <p style={{ margin: 0, fontSize: "var(--type-xs)", color: "var(--text-secondary)" }}>
                {habitsLeft} {habitsLeft === 1 ? "habit" : "habits"} · {pendingTodayTasks.length} {pendingTodayTasks.length === 1 ? "task" : "tasks"} to go
                {todayFocusTime > 0 ? ` · ${todayFocusTime}m focused` : ""}
              </p>
            </div>
          </section>

          {upcomingTimelineBlocks.length > 0 && (
            <section aria-label="Schedule" className="atelier-group">
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", fontWeight: 500, color: "var(--text-primary)", margin: 0 }}>
                  Scheduled Today
                </h2>
                <span style={{ fontSize: "var(--type-xs)", color: "var(--text-secondary)", fontWeight: 500 }}>
                  {formatDuration(totalPlannedMinutes)} planned
                </span>
              </div>
              <div className="row-card" style={{ padding: "4px var(--space-4)" }}>
                {upcomingTimelineBlocks.map((block) => renderTimelineBlock(block))}
              </div>
            </section>
          )}

          <section aria-label="Quick actions" className="atelier-group row-card" style={{ padding: "var(--space-4)" }}>
            <h2 style={{ fontSize: "var(--type-xs)", fontWeight: "var(--font-semibold)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 12px" }}>
              Quick Actions
            </h2>
            <div className="today-quick-action-list" style={{ display: "flex", flexWrap: "wrap", gap: "6px 8px" }}>
              <button type="button" onClick={focusQuickTaskInput} aria-label="Add task" title="Add task" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: "var(--radius-pill)", border: "1px solid var(--border-color)", background: "transparent", color: "var(--text-muted)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <Plus size={13} aria-hidden="true" />
                Add Task
              </button>
              <button type="button" onClick={() => onStartFocus()} aria-label="Start focus session" title="Start focus session" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: "var(--radius-pill)", border: "1px solid var(--border-color)", background: "transparent", color: "var(--text-muted)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <Play size={13} aria-hidden="true" />
                Start Focus Session
              </button>
              <button type="button" onClick={onNavigateToHabits} aria-label="Configure habits" title="Configure habits" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: "var(--radius-pill)", border: "1px solid var(--border-color)", background: "transparent", color: "var(--text-muted)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <ListChecks size={13} aria-hidden="true" />
                Configure Habits
              </button>
              <button type="button" onClick={onNavigateToHistory} aria-label="View history" title="View history" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: "var(--radius-pill)", border: "1px solid var(--border-color)", background: "transparent", color: "var(--text-muted)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <HistoryIcon size={13} aria-hidden="true" />
                View History
              </button>
              <button type="button" onClick={onNavigateToAnalytics} aria-label="Receive analytics" title="Receive analytics" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: "var(--radius-pill)", border: "1px solid var(--border-color)", background: "transparent", color: "var(--text-muted)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <BarChart3 size={13} aria-hidden="true" />
                Receive Analytics
              </button>
            </div>
          </section>
        </aside>
      </div>

      {renderScheduleModal()}
    </div>
  );
}

export default Today;
