import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Minus, Plus } from "lucide-react";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

import { FORM_CONTROL } from "../theme";
import type { Mode, Session, FocusTimerHabit, Milestone, Project, Task, Habit } from "../types";
import { registerFocusTimerRunningState } from "../domain/notificationLogic";
import { filterTasksForFocusSelection } from "../domain/tasks";
import {
  clampFocusDurationMinutes,
  fitCountdownFontSize,
  formatCountdownClock,
  getFocusSessionsForLogicalToday,
  isValidFocusDurationMinutes,
  MAX_FOCUS_DURATION_MINUTES,
  parseCountdownDuration,
} from "../domain/focusTimer";
import {
  focusSessionCompletionKey,
  hasFocusSessionCompletion,
  rememberFocusSessionCompletion,
  type FocusTimerSnapshot,
} from "../domain/focusTimerRecovery";
import { loadFocusTimerSnapshot, saveFocusTimerSnapshot } from "../utils/storage";
import { playSfx, primeAudioContext as primeSfxContext } from "../utils/sfx";

type FocusTimerProps = {
  habits: FocusTimerHabit[];
  focusSessions: { timestamp: number; durationMinutes: number }[];
  onSessionComplete: (sessionType: "Timer" | "Pomodoro Focus", durationMinutes: number, habitName: string, goalId?: string, milestoneId?: string, taskId?: string, habitId?: number) => void;
  defaultFocusDuration: number;
  dayResetHour: number;
  quickAdjustStepMinutes: number;
  onQuickAdjustStepChange: (minutes: number) => void;
  milestones: Milestone[];
  tasks: Task[];
  projects?: Project[];
  onCompleteTask?: (taskId: string) => void;
  allHabits?: Habit[];
  initialEntityId?: { taskId?: string; habitId?: number; goalId?: string; projectId?: string; milestoneId?: string; title?: string };
  // One-shot auto-start request: set a short duration on the existing Timer
  // and start it. Entity-agnostic — the linked task/habit arrives through
  // initialEntityId. Cleared via onAutoStartHandled so it can never restart
  // the timer or log twice.
  autoStartAction?: { taskId?: string; habitId?: number; title?: string; durationMinutes?: number } | null;
  onAutoStartHandled?: () => void;
  // One-shot duration prefill without starting: set the idle Timer controls
  // once, then clear via onPresetDurationHandled. Never auto-starts.
  presetDurationMinutes?: number | null;
  onPresetDurationHandled?: () => void;
  onTimerShortcutReady?: (handler: (() => boolean) | null) => void;
};

const DEFAULT_BREAK_MINUTES = 5;
const MAX_DURATION_MINUTES = MAX_FOCUS_DURATION_MINUTES;
const RADIUS = 80;
const STROKE_WIDTH = 5;
const VIEW_BOX_SIZE = 200;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
// Breathing room (CSS px) kept between the countdown glyphs and the ring's
// inner stroke edge on top of COUNTDOWN_FIT_RATIO.
const RING_TEXT_PADDING_PX = 10;
const DURATION_PRESETS = [15, 25, 45, 60];
const QUICK_ADJUST_PRESETS = [1, 2, 5, 10];
const TIMER_NOTIFICATION_TITLE = "Timer Finished";
const TIMER_NOTIFICATION_BODY = "Selected Timer is Completed";

async function notifyTimerFinished() {
  try {
    await sendNotification({
      title: TIMER_NOTIFICATION_TITLE,
      body: TIMER_NOTIFICATION_BODY,
    });
    return;
  } catch (error) {
    console.error("Failed to send timer notification", error);
  }

  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    new Notification(TIMER_NOTIFICATION_TITLE, { body: TIMER_NOTIFICATION_BODY });
  } catch {
    // Some embedded webviews reject browser notification construction.
  }
}

const styles: Record<string, CSSProperties> = {
  stage: {
    width: "100%",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "var(--space-5)",
    padding: "var(--space-6) var(--space-4) var(--space-8)",
    textAlign: "center",
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "var(--font-bold)",
    textTransform: "uppercase",
    letterSpacing: "0.14em",
    color: "var(--text-muted)",
    margin: 0,
  },
  title: {
    margin: 0,
    fontFamily: "var(--font-display)",
    fontWeight: 500,
    letterSpacing: "-0.02em",
    lineHeight: 1.05,
    fontSize: "clamp(1.9rem, 4vw, 2.6rem)",
    color: "var(--text-primary)",
  },
  sub: {
    margin: 0,
    color: "var(--text-secondary)",
    fontSize: "var(--type-sm)",
    lineHeight: 1.55,
    maxWidth: "65ch",
  },
  segment: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: 4,
    borderRadius: "var(--radius-pill)",
    border: "1px solid var(--border-color)",
    background: "var(--bg-surface)",
  },
  segmentButton: {
    border: "1px solid transparent",
    borderRadius: "var(--radius-pill)",
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: "var(--type-sm)",
    fontWeight: "var(--font-semibold)",
    padding: "7px 18px",
    cursor: "pointer",
    lineHeight: 1.25,
  },
  segmentButtonActive: {
    background: "var(--text-primary)",
    color: "var(--bg-primary)",
  },
  ringStage: {
    position: "relative",
    width: "min(100%, 340px)",
    aspectRatio: "1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  digits: {
    // Seed size before the measured fit lands; fitCountdownToRing replaces
    // it (via countdownFontSize) with the largest size that fits the ring.
    fontSize: "clamp(3rem, 10vw, 5.5rem)",
  },
  phaseLine: {
    margin: 0,
    fontSize: "var(--type-sm)",
    fontWeight: "var(--font-semibold)",
    color: "var(--text-secondary)",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  dots: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    border: "1px solid var(--border-strong)",
    background: "transparent",
  },
  dotFilled: {
    background: "var(--color-accent)",
    borderColor: "var(--color-accent)",
  },
  contextLine: {
    margin: 0,
    fontSize: "var(--type-sm)",
    color: "var(--text-secondary)",
    lineHeight: 1.55,
    maxWidth: "65ch",
  },
  contextStrong: {
    color: "var(--text-primary)",
    fontWeight: "var(--font-semibold)",
  },
  contextMeta: {
    color: "var(--text-muted)",
    fontSize: "var(--type-xs)",
  },
  inlineAction: {
    background: "transparent",
    border: "1px solid transparent",
    borderRadius: "var(--radius-sm)",
    padding: "4px 10px",
    color: "var(--color-accent)",
    fontSize: "var(--type-sm)",
    fontWeight: "var(--font-medium)",
    cursor: "pointer",
  },
  adjustRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  adjustButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 36,
    padding: "7px 14px",
    background: "transparent",
    border: "1px solid var(--border-color)",
    borderRadius: "var(--radius-pill)",
    color: "var(--text-secondary)",
    fontSize: "var(--type-sm)",
    fontWeight: "var(--font-semibold)",
    cursor: "pointer",
  },
  primaryRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    flexWrap: "wrap",
    width: "100%",
  },
  presetRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  presetPill: {
    border: "1px solid var(--border-color)",
    borderRadius: "var(--radius-pill)",
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: "var(--type-sm)",
    fontWeight: "var(--font-semibold)",
    padding: "7px 16px",
    cursor: "pointer",
    lineHeight: 1.25,
  },
  presetPillActive: {
    background: "var(--accent-wash-soft)",
    border: "1px solid transparent",
    color: "var(--color-accent)",
  },
  panel: {
    width: "100%",
    background: "var(--bg-surface)",
    border: "1px solid var(--border-color)",
    borderRadius: "var(--radius-lg)",
    padding: "var(--space-4)",
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-3)",
    textAlign: "left",
  },
  panelTitle: {
    margin: 0,
    fontSize: 11,
    fontWeight: "var(--font-bold)",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "var(--text-muted)",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0,
  },
  fieldGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
    gap: "var(--space-3)",
  },
  fieldLabel: {
    fontSize: "var(--type-xs)",
    fontWeight: "var(--font-semibold)",
    color: "var(--text-secondary)",
  },
  select: {
    ...FORM_CONTROL,
    width: "100%",
    cursor: "pointer",
  },
  durationGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
    gap: "var(--space-3)",
  },
  durationField: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 96px)",
    alignItems: "center",
    gap: 10,
  },
  durationCaption: {
    minWidth: 0,
    fontSize: "var(--type-sm)",
    color: "var(--text-secondary)",
    overflowWrap: "anywhere",
  },
  durationInput: {
    ...FORM_CONTROL,
    width: "100%",
    minWidth: 0,
    maxWidth: 96,
    fontVariantNumeric: "tabular-nums",
  },
  durationInputDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  stepGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 6,
  },
  todayLine: {
    margin: 0,
    fontSize: "var(--type-sm)",
    color: "var(--text-secondary)",
  },
  todayStrong: {
    color: "var(--text-primary)",
    fontWeight: "var(--font-semibold)",
    fontVariantNumeric: "tabular-nums",
  },
};

function getSessionTotalMs(
  mode: Mode,
  session: Session,
  timerMinutes: number,
  focusDurationMs: number,
  breakDurationMs: number,
): number {
  if (mode === "Pomodoro") {
    return session === "Focus" ? focusDurationMs : breakDurationMs;
  }
  return timerMinutes * 60000;
}

function FocusTimer({
  habits,
  focusSessions,
  onSessionComplete,
  defaultFocusDuration,
  dayResetHour,
  quickAdjustStepMinutes,
  onQuickAdjustStepChange,
  milestones,
  tasks,
  projects,
  onCompleteTask,
  allHabits,
  initialEntityId,
  autoStartAction,
  onAutoStartHandled,
  presetDurationMinutes,
  onPresetDurationHandled,
  onTimerShortcutReady,
}: FocusTimerProps) {
  const [restoredSnapshot] = useState(() => loadFocusTimerSnapshot(defaultFocusDuration));
  const [mode, setMode] = useState<Mode>(restoredSnapshot.mode);
  const [timerMinutes, setTimerMinutes] = useState(restoredSnapshot.timer.minutes);
  const [focusMinutes, setFocusMinutes] = useState(restoredSnapshot.pomodoro.focusMinutes);
  const [breakMinutes, setBreakMinutes] = useState(restoredSnapshot.pomodoro.breakMinutes);
  const [timerRemainingMs, setTimerRemainingMs] = useState(restoredSnapshot.timer.remainingMs);
  const [timerTotalMs, setTimerTotalMs] = useState(restoredSnapshot.timer.totalMs);
  const [pomodoroRemainingMs, setPomodoroRemainingMs] = useState(restoredSnapshot.pomodoro.remainingMs);
  const [pomodoroTotalMs, setPomodoroTotalMs] = useState(restoredSnapshot.pomodoro.totalMs);
  const [countdownEditDraft, setCountdownEditDraft] = useState<string | null>(null);
  const isCountdownEditing = countdownEditDraft !== null;
  const [countdownEditError, setCountdownEditError] = useState("");
  const [timerRunning, setTimerRunning] = useState(restoredSnapshot.timer.running);
  const [pomodoroRunning, setPomodoroRunning] = useState(restoredSnapshot.pomodoro.running);
  const [pomodoroSession, setPomodoroSession] = useState<Session>(restoredSnapshot.pomodoro.session);
  const [selectedHabitId, setSelectedHabitId] = useState<number | "">(restoredSnapshot.selection.habitId);
  // Legacy goal link preserved on records only; no Goal selector in the UI.
  const [selectedGoalId, setSelectedGoalId] = useState(restoredSnapshot.selection.goalId);
  const [selectedProjectId, setSelectedProjectId] = useState(restoredSnapshot.selection.projectId);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState(restoredSnapshot.selection.milestoneId);
  const [selectedTaskId, setSelectedTaskId] = useState(restoredSnapshot.selection.taskId);
  // Task linked to the most recently logged session. Used only to offer a
  // manual "mark complete" affordance — a Task is never completed automatically.
  const [lastSessionTaskId, setLastSessionTaskId] = useState<string | null>(null);
  const [previousInitialEntityId, setPreviousInitialEntityId] = useState(initialEntityId);
  const [timerDurationDraft, setTimerDurationDraft] = useState<string | null>(null);
  const [focusDurationDraft, setFocusDurationDraft] = useState<string | null>(null);
  const [breakDurationDraft, setBreakDurationDraft] = useState<string | null>(null);
  const [quickAdjustStepDraft, setQuickAdjustStepDraft] = useState(String(quickAdjustStepMinutes));

  if (initialEntityId !== previousInitialEntityId) {
    setPreviousInitialEntityId(initialEntityId);
    setLastSessionTaskId(null);
    if (initialEntityId?.taskId) {
      setSelectedTaskId(initialEntityId.taskId);
      const task = tasks.find((item) => item.id === initialEntityId.taskId);
      setSelectedGoalId(task?.goalId ?? initialEntityId.goalId ?? "");
      setSelectedProjectId(task?.projectId ?? initialEntityId.projectId ?? "");
      setSelectedMilestoneId(task?.milestoneId ?? initialEntityId.milestoneId ?? "");
      setSelectedHabitId("");
    } else if (initialEntityId?.habitId) {
      setSelectedHabitId(initialEntityId.habitId);
      const habit = allHabits?.find((item) => item.id === initialEntityId.habitId);
      setSelectedGoalId(habit?.goalId ?? initialEntityId.goalId ?? "");
      setSelectedProjectId("");
      setSelectedMilestoneId("");
      setSelectedTaskId("");
    } else if (initialEntityId?.goalId || initialEntityId?.projectId || initialEntityId?.milestoneId) {
      setSelectedGoalId(initialEntityId.goalId ?? "");
      setSelectedProjectId(initialEntityId.projectId ?? "");
      setSelectedMilestoneId(initialEntityId.milestoneId ?? "");
      setSelectedTaskId("");
      setSelectedHabitId("");
    }
  }

  const timerEndTimestampRef = useRef<number | null>(restoredSnapshot.timer.endAt);
  const pomodoroEndTimestampRef = useRef<number | null>(restoredSnapshot.pomodoro.endAt);
  const timerRunningRef = useRef(restoredSnapshot.timer.running);
  const pomodoroRunningRef = useRef(restoredSnapshot.pomodoro.running);
  const pomodoroSessionRef = useRef<Session>(restoredSnapshot.pomodoro.session);
  const timerRemainingRef = useRef(restoredSnapshot.timer.remainingMs);
  const pomodoroRemainingRef = useRef(restoredSnapshot.pomodoro.remainingMs);
  const timerTotalMsRef = useRef(restoredSnapshot.timer.totalMs);
  const pomodoroTotalMsRef = useRef(restoredSnapshot.pomodoro.totalMs);
  const timerMinutesRef = useRef(restoredSnapshot.timer.minutes);
  const focusMinutesRef = useRef(restoredSnapshot.pomodoro.focusMinutes);
  const focusDurationMsRef = useRef(restoredSnapshot.pomodoro.focusDurationMs);
  const breakDurationMsRef = useRef(restoredSnapshot.pomodoro.breakDurationMs);
  const loggedSessionKeysRef = useRef(new Set(restoredSnapshot.loggedSessionKeys));
  const appliedDefaultFocusDurationRef = useRef(defaultFocusDuration);
  const breakMinutesRef = useRef(restoredSnapshot.pomodoro.breakMinutes);
  const updateTimerRef = useRef<(now: number) => void>(() => {});
  const updatePomodoroRef = useRef<(now: number) => void>(() => {});
  const quickAdjustStepInputFocusedRef = useRef(false);
  const primaryControlRef = useRef<HTMLButtonElement>(null);
  const ringStageRef = useRef<HTMLDivElement>(null);
  const digitsRef = useRef<HTMLSpanElement>(null);
  const countdownEditInputRef = useRef<HTMLInputElement>(null);
  const cancelCountdownEditRef = useRef(false);
  // Measured font size that keeps the countdown inside the ring; null until
  // the first fit, so the seed clamp in styles.digits shows before that.
  const [countdownFontSize, setCountdownFontSize] = useState<number | null>(null);

  useEffect(() => {
    if (!isCountdownEditing) return;
    countdownEditInputRef.current?.focus();
    countdownEditInputRef.current?.select();
  }, [isCountdownEditing]);

  useEffect(() => {
    const getIsRunning = () => timerRunningRef.current || pomodoroRunningRef.current;
    return registerFocusTimerRunningState(getIsRunning);
  }, []);

  useEffect(() => {
    if (!quickAdjustStepInputFocusedRef.current) {
      setQuickAdjustStepDraft(String(quickAdjustStepMinutes));
    }
  }, [quickAdjustStepMinutes]);

  function updateTimerTotalMs(totalMs: number) {
    timerTotalMsRef.current = totalMs;
    setTimerTotalMs(totalMs);
  }

  function updatePomodoroTotalMs(totalMs: number) {
    pomodoroTotalMsRef.current = totalMs;
    setPomodoroTotalMs(totalMs);
  }

  useEffect(() => {
    let cancelled = false;

    async function requestNotificationPermission() {
      try {
        if (!await isPermissionGranted() && !cancelled) {
          await requestPermission();
        }
      } catch (error) {
        console.error("Failed to request notification permission", error);
      }
    }

    void requestNotificationPermission();
    return () => {
      cancelled = true;
    };
  }, []);

  // Synchronize idle timer controls when the saved default changes.
  useEffect(() => {
    if (appliedDefaultFocusDurationRef.current === defaultFocusDuration) return;
    appliedDefaultFocusDurationRef.current = defaultFocusDuration;

    if (!timerRunningRef.current) {
      timerMinutesRef.current = defaultFocusDuration;
      setTimerMinutes(defaultFocusDuration);
      updateTimerTotalMs(defaultFocusDuration * 60000);
      setTimerState(defaultFocusDuration * 60000, false);
    }
    if (!pomodoroRunningRef.current) {
      focusMinutesRef.current = defaultFocusDuration;
      setFocusMinutes(defaultFocusDuration);
      focusDurationMsRef.current = defaultFocusDuration * 60000;
      if (pomodoroSessionRef.current === "Focus") {
        updatePomodoroTotalMs(defaultFocusDuration * 60000);
        setPomodoroState(defaultFocusDuration * 60000, false, "Focus");
      }
    }
  }, [defaultFocusDuration]);

  function getSelectedHabitName(): string {
    if (selectedHabitId === "") return "General Focus";
    const habit = habits.find((h) => h.id === selectedHabitId);
    return habit?.name ?? "General Focus";
  }

  function handleSessionComplete(
    sessionType: "Timer" | "Pomodoro Focus",
    durationMinutes: number,
    habitName: string,
  ) {
    if (selectedTaskId) {
      setLastSessionTaskId(selectedTaskId);
    }
    onSessionComplete(
      sessionType,
      durationMinutes,
      habitName,
      selectedGoalId || undefined,
      selectedMilestoneId || undefined,
      selectedTaskId || undefined,
      selectedHabitId === "" ? undefined : selectedHabitId,
    );
  }

  function handleProjectChange(projectId: string) {
    setSelectedProjectId(projectId);
    setSelectedMilestoneId("");
    setSelectedTaskId("");
    setLastSessionTaskId(null);
  }

  function handleMilestoneChange(milestoneId: string) {
    setSelectedMilestoneId(milestoneId);
    setSelectedTaskId("");
    setLastSessionTaskId(null);
  }

  function handleTaskChange(taskId: string) {
    setSelectedTaskId(taskId);
    setLastSessionTaskId(null);
    if (!taskId) return;
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    // Selecting a Task directly must behave like the Task's "Start Focus"
    // action: attach the exact taskId and preserve its Project/Milestone
    // context. Legacy goalId links are preserved on the record only.
    if (task.milestoneId) {
      setSelectedMilestoneId(task.milestoneId);
    } else {
      setSelectedMilestoneId("");
    }
    if (task.projectId) {
      setSelectedProjectId(task.projectId);
    } else if (task.milestoneId) {
      const milestone = milestones.find((item) => item.id === task.milestoneId);
      setSelectedProjectId(milestone?.projectId ?? "");
    } else {
      setSelectedProjectId("");
    }
    setSelectedGoalId(task.goalId ?? "");
  }

  const availableMilestones = milestones.filter((milestone) =>
    !milestone.completed &&
    (selectedProjectId === "" || milestone.projectId === selectedProjectId),
  );
  const availableTasks = selectedMilestoneId || selectedProjectId
    ? filterTasksForFocusSelection(tasks, "", selectedMilestoneId, selectedProjectId || undefined)
    : tasks;

  // Currently linked Task plus its preserved Project/Milestone context.
  const selectedTask = selectedTaskId
    ? tasks.find((task) => task.id === selectedTaskId)
    : undefined;
  const selectedTaskMilestone = selectedTask?.milestoneId
    ? milestones.find((milestone) => milestone.id === selectedTask.milestoneId)
    : undefined;
  const selectedTaskProject = selectedTask?.projectId ?? selectedTaskMilestone?.projectId
    ? projects?.find((project) => project.id === (selectedTask?.projectId ?? selectedTaskMilestone?.projectId))
    : undefined;
  const selectedTaskContextParts = [
    selectedTaskProject?.name,
    selectedTaskMilestone?.title,
  ].filter((part): part is string => part !== undefined && part !== "");
  const selectedHabit = selectedHabitId === ""
    ? undefined
    : habits.find((habit) => habit.id === selectedHabitId);
  // Post-session completion is strictly manual: the button below is the only
  // path that completes a Task, and it renders only for the just-logged session.
  const showTaskCompleteAffordance = onCompleteTask !== undefined &&
    lastSessionTaskId !== null &&
    lastSessionTaskId === selectedTaskId &&
    selectedTask !== undefined &&
    !selectedTask.completed;

  const requestNotificationPermissionIfNeeded = useCallback(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Only surfaces a desktop notification when the tab is actually
  // hidden/minimized — otherwise the on-screen ring and chime already
  // cover it, and a notification on top would just be noise.
  function notifyIfBackgrounded(title: string, body: string) {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (document.visibilityState === "visible") return;

    try {
      new Notification(title, { body, silent: true });
    } catch {
      // Some environments (e.g. certain embedded webviews) reject
      // Notification construction outright; fail quietly.
    }
  }

  function setTimerState(remainingMs: number, running: boolean) {
    timerRemainingRef.current = remainingMs;
    timerRunningRef.current = running;
    setTimerRemainingMs(remainingMs);
    setTimerRunning(running);
  }

  function setPomodoroState(
    remainingMs: number,
    running: boolean,
    session: Session,
  ) {
    pomodoroRemainingRef.current = remainingMs;
    pomodoroRunningRef.current = running;
    pomodoroSessionRef.current = session;
    setPomodoroRemainingMs(remainingMs);
    setPomodoroRunning(running);
    setPomodoroSession(session);
  }

  const buildFocusTimerSnapshot = useCallback((): FocusTimerSnapshot => {
    return {
      version: 1,
      mode,
      timer: {
        totalMs: timerTotalMsRef.current,
        remainingMs: timerRemainingRef.current,
        minutes: timerMinutesRef.current,
        running: timerRunningRef.current,
        endAt: timerEndTimestampRef.current,
      },
      pomodoro: {
        totalMs: pomodoroTotalMsRef.current,
        remainingMs: pomodoroRemainingRef.current,
        session: pomodoroSessionRef.current,
        focusMinutes: focusMinutesRef.current,
        breakMinutes: breakMinutesRef.current,
        focusDurationMs: focusDurationMsRef.current,
        breakDurationMs: breakDurationMsRef.current,
        running: pomodoroRunningRef.current,
        endAt: pomodoroEndTimestampRef.current,
      },
      selection: {
        habitId: selectedHabitId,
        goalId: selectedGoalId,
        projectId: selectedProjectId,
        milestoneId: selectedMilestoneId,
        taskId: selectedTaskId,
      },
      loggedSessionKeys: [...loggedSessionKeysRef.current],
    };
  }, [
    mode,
    selectedHabitId,
    selectedGoalId,
    selectedProjectId,
    selectedMilestoneId,
    selectedTaskId,
  ]);

  function shouldLogSession(modeToLog: Mode, session: Session, endTimestamp: number): boolean {
    return !hasFocusSessionCompletion(
      [...loggedSessionKeysRef.current],
      focusSessionCompletionKey(modeToLog, session, endTimestamp),
    );
  }

  function markSessionLogged(modeToLog: Mode, session: Session, endTimestamp: number) {
    const key = focusSessionCompletionKey(modeToLog, session, endTimestamp);
    loggedSessionKeysRef.current = new Set(
      rememberFocusSessionCompletion([...loggedSessionKeysRef.current], key),
    );
    saveFocusTimerSnapshot(buildFocusTimerSnapshot());
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  function updateTimer(now: number) {
    const end = timerEndTimestampRef.current;
    if (end === null) return;

    const remaining = end - now;
    if (remaining > 0) {
      timerRemainingRef.current = remaining;
      setTimerRemainingMs(remaining);
    } else {
      timerEndTimestampRef.current = null;
      setTimerState(0, false);

      // Persist the completion identity before notifying app state, so a
      // restart in the same render cannot emit the same completion twice.
      if (shouldLogSession("Timer", "Focus", end)) {
        markSessionLogged("Timer", "Focus", end);
        handleSessionComplete(
          "Timer",
          Math.round(timerTotalMsRef.current / 60000),
          getSelectedHabitName(),
        );
        playSfx("timerComplete");
        void notifyTimerFinished();
      }
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  function updatePomodoro(now: number) {
    const initialEnd = pomodoroEndTimestampRef.current;
    if (initialEnd === null) return;

    let end = initialEnd;
    let currentSession = pomodoroSessionRef.current;
    const startingSession = pomodoroSessionRef.current;
    let sessionTotalMs = pomodoroTotalMsRef.current;

    // Advance through every completed session so a suspended tab still
    // lands on the correct Focus or Break session when it resumes.
    while (now >= end) {
      const sessionEndTimestamp = end;
      const sessionCompleting = currentSession;
      currentSession = currentSession === "Focus" ? "Break" : "Focus";

      // Log completed Focus sessions only (not Break sessions)
      if (sessionCompleting === "Focus" && shouldLogSession("Pomodoro", "Focus", sessionEndTimestamp)) {
        markSessionLogged("Pomodoro", "Focus", sessionEndTimestamp);
        handleSessionComplete(
          "Pomodoro Focus",
          Math.round(sessionTotalMs / 60000),
          getSelectedHabitName(),
        );
      }

      sessionTotalMs = getSessionTotalMs(
        "Pomodoro",
        currentSession,
        timerMinutesRef.current,
        focusDurationMsRef.current,
        breakDurationMsRef.current,
      );
      end += sessionTotalMs;
    }

    const remaining = end - now;
    pomodoroEndTimestampRef.current = end;
    pomodoroRemainingRef.current = remaining;
    setPomodoroRemainingMs(remaining);
    if (currentSession !== startingSession) {
      updatePomodoroTotalMs(sessionTotalMs);
      pomodoroSessionRef.current = currentSession;
      setPomodoroSession(currentSession);
      playSfx("pomodoroTransition");
      notifyIfBackgrounded(
        "Session Switch",
        `Now On Your ${currentSession} Session`,
      );
    }
  }

  useEffect(() => {
    updateTimerRef.current = updateTimer;
    updatePomodoroRef.current = updatePomodoro;
  }, [updatePomodoro, updateTimer]);

  const handleStart = useCallback(() => {
    requestNotificationPermissionIfNeeded();
    primeSfxContext();

    const remainingMs = mode === "Timer" ? timerRemainingRef.current : pomodoroRemainingRef.current;
    const totalMs = mode === "Timer" ? timerTotalMsRef.current : pomodoroTotalMsRef.current;
    const startRemainingMs = remainingMs > 0 ? remainingMs : totalMs;

    // Match the Start/Resume button label below: resuming partial progress
    // plays the resume sound, while a full bar is always a fresh start.
    // Deriving this from remaining/total (instead of a flag) keeps the
    // sound correct across completions, resets, duration changes, and modes.
    playSfx(startRemainingMs < totalMs ? "pauseResume" : "start");

    const now = Date.now();
    if (mode === "Timer") {
      if (startRemainingMs <= 0) return;
      timerEndTimestampRef.current = now + startRemainingMs;
      setTimerState(startRemainingMs, true);
    } else {
      if (startRemainingMs <= 0) return;
      pomodoroEndTimestampRef.current = now + startRemainingMs;
      setPomodoroState(
        startRemainingMs,
        true,
        pomodoroSessionRef.current,
      );
    }
  }, [mode, requestNotificationPermissionIfNeeded]);

  function handlePause() {
    const now = Date.now();
    if (mode === "Timer") {
      updateTimer(now);
      timerEndTimestampRef.current = null;
      setTimerState(timerRemainingRef.current, false);
    } else {
      updatePomodoro(now);
      pomodoroEndTimestampRef.current = null;
      setPomodoroState(
        pomodoroRemainingRef.current,
        false,
        pomodoroSessionRef.current,
      );
    }
    playSfx("pauseResume");
  }

  function handleReset() {
    if (mode === "Timer") {
      const totalMs = timerTotalMsRef.current;
      updateTimerTotalMs(totalMs);
      timerEndTimestampRef.current = null;
      setTimerState(totalMs, false);
    } else {
      const totalMs = pomodoroTotalMsRef.current;
      updatePomodoroTotalMs(totalMs);
      pomodoroEndTimestampRef.current = null;
      setPomodoroState(
        totalMs,
        false,
        pomodoroSessionRef.current,
      );
    }
  }

  function handleModeChange(nextMode: Mode) {
    setMode(nextMode);
  }

  const handleTimerDurationChange = useCallback((value: string) => {
    const parsed = clampFocusDurationMinutes(value, defaultFocusDuration);
    timerMinutesRef.current = parsed;
    setTimerMinutes(parsed);
    if (!timerRunningRef.current) {
      updateTimerTotalMs(parsed * 60000);
      setTimerState(parsed * 60000, false);
    }
  }, [defaultFocusDuration]);

  useEffect(() => {
    if (!autoStartAction) return;

    // handleStart closes over the current mode: commit Timer first so a stale
    // Pomodoro closure cannot start instead.
    if (mode !== "Timer") {
      const modeFrameId = window.requestAnimationFrame(() => {
        setMode("Timer");
      });
      return () => {
        window.cancelAnimationFrame(modeFrameId);
      };
    }

    const durationMinutes = clampFocusDurationMinutes(autoStartAction.durationMinutes ?? defaultFocusDuration, defaultFocusDuration);
    const frameId = window.requestAnimationFrame(() => {
      handleTimerDurationChange(String(durationMinutes));
      handleStart();
      onAutoStartHandled?.();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [autoStartAction, defaultFocusDuration, handleStart, handleTimerDurationChange, mode, onAutoStartHandled]);

  useEffect(() => {
    if (presetDurationMinutes == null) return;
    if (timerRunningRef.current || pomodoroRunningRef.current) {
      onPresetDurationHandled?.();
      return;
    }

    // Mirror the one-shot auto-start: commit Timer mode first so the 15:00
    // prefill lands on the visible duration input/countdown, not Pomodoro.
    if (mode !== "Timer") {
      const modeFrameId = window.requestAnimationFrame(() => {
        setMode("Timer");
      });
      return () => {
        window.cancelAnimationFrame(modeFrameId);
      };
    }

    const durationMinutes = clampFocusDurationMinutes(presetDurationMinutes, defaultFocusDuration);
    const frameId = window.requestAnimationFrame(() => {
      handleTimerDurationChange(String(durationMinutes));
      onPresetDurationHandled?.();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [presetDurationMinutes, defaultFocusDuration, handleTimerDurationChange, mode, onPresetDurationHandled]);

  function handleFocusDurationChange(value: string) {
    const parsed = clampFocusDurationMinutes(value, defaultFocusDuration);
    focusMinutesRef.current = parsed;
    setFocusMinutes(parsed);
    focusDurationMsRef.current = parsed * 60000;
    if (!pomodoroRunningRef.current && pomodoroSessionRef.current === "Focus") {
      updatePomodoroTotalMs(parsed * 60000);
      setPomodoroState(parsed * 60000, false, "Focus");
    }
  }

  function handleBreakDurationChange(value: string) {
    const parsed = clampFocusDurationMinutes(value, DEFAULT_BREAK_MINUTES);
    breakMinutesRef.current = parsed;
    setBreakMinutes(parsed);
    breakDurationMsRef.current = parsed * 60000;
    if (!pomodoroRunningRef.current && pomodoroSessionRef.current === "Break") {
      updatePomodoroTotalMs(parsed * 60000);
      setPomodoroState(parsed * 60000, false, "Break");
    }
  }

  function commitCountdownEdit(value: string) {
    const durationMs = parseCountdownDuration(value);
    if (durationMs === null) {
      setCountdownEditError("Enter at least 1 minute, using minutes or minutes:seconds.");
      return;
    }

    setCountdownEditDraft(null);
    setCountdownEditError("");
    const wholeMinutes = Math.ceil(durationMs / 60000);
    if (mode === "Timer") {
      timerMinutesRef.current = wholeMinutes;
      setTimerMinutes(wholeMinutes);
      updateTimerTotalMs(durationMs);
      timerEndTimestampRef.current = null;
      setTimerState(durationMs, false);
      return;
    }

    const session = pomodoroSessionRef.current;
    if (session === "Focus") {
      focusMinutesRef.current = wholeMinutes;
      setFocusMinutes(wholeMinutes);
      focusDurationMsRef.current = durationMs;
    } else {
      breakMinutesRef.current = wholeMinutes;
      setBreakMinutes(wholeMinutes);
      breakDurationMsRef.current = durationMs;
    }
    updatePomodoroTotalMs(durationMs);
    pomodoroEndTimestampRef.current = null;
    setPomodoroState(durationMs, false, session);
  }

  function handlePreset(minutes: number) {
    if (mode === "Timer") {
      handleTimerDurationChange(String(minutes));
    } else {
      handleFocusDurationChange(String(minutes));
    }
  }

  function handleQuickAdjust(direction: -1 | 1, shiftKey: boolean) {
    const now = Date.now();
    const adjustmentMs = (shiftKey ? 1 : quickAdjustStepMinutes) * 60000 * direction;

    if (mode === "Timer") {
      if (timerRunningRef.current) updateTimer(now);
      const previousRemaining = timerRemainingRef.current;
      const nextRemaining = Math.max(0, Math.min(timerTotalMsRef.current, previousRemaining + adjustmentMs));
      const remainsRunning = timerRunningRef.current && nextRemaining > 0;
      timerEndTimestampRef.current = remainsRunning ? now + nextRemaining : null;
      setTimerState(nextRemaining, remainsRunning);
      return;
    }

    if (pomodoroRunningRef.current) updatePomodoro(now);
    const previousRemaining = pomodoroRemainingRef.current;
    const nextRemaining = Math.max(0, Math.min(pomodoroTotalMsRef.current, previousRemaining + adjustmentMs));
    const remainsRunning = pomodoroRunningRef.current && nextRemaining > 0;
    pomodoroEndTimestampRef.current = remainsRunning ? now + nextRemaining : null;
    setPomodoroState(nextRemaining, remainsRunning, pomodoroSessionRef.current);
  }

  useEffect(() => {
    function tick() {
      const now = Date.now();
      if (timerRunningRef.current || timerEndTimestampRef.current !== null) {
        updateTimerRef.current(now);
      }
      if (pomodoroRunningRef.current || pomodoroEndTimestampRef.current !== null) {
        updatePomodoroRef.current(now);
      }
    }

    tick();
    const interval = window.setInterval(tick, 250);

    // Force an immediate recompute the moment the tab becomes visible
    // again, in case the interval was fully suspended while hidden
    // rather than merely throttled.
    function handleVisibility() {
      if (document.visibilityState === "visible") tick();
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    saveFocusTimerSnapshot(buildFocusTimerSnapshot());
  }, [
    mode,
    timerMinutes,
    timerRemainingMs,
    timerTotalMs,
    timerRunning,
    focusMinutes,
    breakMinutes,
    pomodoroRemainingMs,
    pomodoroTotalMs,
    pomodoroRunning,
    pomodoroSession,
    selectedHabitId,
    selectedGoalId,
    selectedProjectId,
    selectedMilestoneId,
    selectedTaskId,
    buildFocusTimerSnapshot,
  ]);

  const isRunning = mode === "Timer" ? timerRunning : pomodoroRunning;
  const remainingMs = mode === "Timer" ? timerRemainingMs : pomodoroRemainingMs;
  const initialDurationMs = mode === "Timer" ? timerTotalMs : pomodoroTotalMs;
  const fraction = initialDurationMs > 0 ? Math.min(1, Math.max(0, remainingMs / initialDurationMs)) : 0;
  const dashOffset = CIRCUMFERENCE * (1 - fraction);
  const countdownText = formatCountdownClock(remainingMs);

  // Scale the countdown from the ring's real geometry and the rendered text
  // instead of a fixed clamp: measure the digits at whatever size they
  // currently render, then apply the font size whose text box fits the ring's
  // inner circle (fitCountdownFontSize solves this in one step because glyph
  // metrics scale linearly with font size). The dead band skips writes when a
  // per-second re-measure lands on the same size, so ticking stays smooth.
  const fitCountdownToRing = useCallback(() => {
    const stage = ringStageRef.current;
    const digits = digitsRef.current;
    if (!stage || !digits) return;

    const stageSize = stage.clientWidth;
    if (stageSize <= 0) return;

    // Ring inner edge at RADIUS - STROKE_WIDTH/2 in viewBox units, converted
    // to CSS px, then pulled in by RING_TEXT_PADDING_PX of breathing room.
    const innerRadiusPx =
      ((RADIUS - STROKE_WIDTH / 2) * stageSize) / VIEW_BOX_SIZE - RING_TEXT_PADDING_PX;
    if (innerRadiusPx <= 0) return;

    const rect = digits.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const currentFontSize = Number.parseFloat(window.getComputedStyle(digits).fontSize);
    if (!Number.isFinite(currentFontSize) || currentFontSize <= 0) return;

    const fittedFontSize = fitCountdownFontSize({
      textWidth: rect.width,
      textHeight: rect.height,
      fontSize: currentFontSize,
      innerDiameter: innerRadiusPx * 2,
    });

    setCountdownFontSize((previous) =>
      previous === null || Math.abs(previous - fittedFontSize) > 0.5
        ? fittedFontSize
        : previous,
    );
  }, []);

  // Re-fit before paint whenever the countdown text (digit count) changes…
  useLayoutEffect(() => {
    fitCountdownToRing();
  }, [countdownText, fitCountdownToRing]);

  // …and whenever the ring itself is resized (window resize, layout shifts).
  useLayoutEffect(() => {
    const stage = ringStageRef.current;
    if (!stage) return;

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", fitCountdownToRing);
      return () => window.removeEventListener("resize", fitCountdownToRing);
    }

    const observer = new ResizeObserver(() => fitCountdownToRing());
    observer.observe(stage);
    return () => observer.disconnect();
  }, [fitCountdownToRing]);

  // A completed timer can start again at its selected duration without Reset.
  const isPaused = !isRunning && remainingMs > 0 && remainingMs < initialDurationMs;
  const primaryButtonText = isRunning
    ? "Pause"
    : isPaused
      ? "Resume"
      : remainingMs <= 0
        ? "Start Again"
        : "Start";
  const timerShortcutActionRef = useRef<() => boolean>(() => false);
  timerShortcutActionRef.current = () => {
    const primaryControl = primaryControlRef.current;
    if (!primaryControl || primaryControl.disabled) return false;
    primaryControl.focus({ preventScroll: true });
    primaryControl.click();
    return true;
  };
  const handleTimerShortcut = useCallback(() => timerShortcutActionRef.current(), []);

  useLayoutEffect(() => {
    onTimerShortcutReady?.(handleTimerShortcut);
    return () => onTimerShortcutReady?.(null);
  }, [handleTimerShortcut, onTimerShortcutReady]);
  const todaySessions = getFocusSessionsForLogicalToday(focusSessions, dayResetHour);
  const focusedTodayMinutes = todaySessions.reduce(
    (total, focusSession) => total + focusSession.durationMinutes,
    0,
  );
  const sessionsDone = todaySessions.length;
  const pomodoroDots = [0, 1, 2, 3];
  const filledDots = mode === "Pomodoro" ? sessionsDone % 4 : 0;
  const linkedLabel = selectedTask
    ? selectedTask.title
    : selectedHabit
      ? selectedHabit.name
      : "Nothing Linked Yet";
  const activeDurationMs = mode === "Timer" ? timerTotalMs : pomodoroTotalMs;
  const pomodoroDurationMs = pomodoroSession === "Focus"
    ? focusDurationMsRef.current
    : breakDurationMsRef.current;
  const pomodoroDurationLabel = pomodoroDurationMs % 60000 === 0
    ? `${pomodoroDurationMs / 60000}m`
    : formatCountdownClock(pomodoroDurationMs);

  return (
    <div style={styles.stage}>
      <div>
        <p style={styles.eyebrow}>Focus</p>
        <h1 style={styles.title}>Settle In for One Session</h1>
      </div>
      <p style={styles.sub}>
        Choose a duration and press Start. Linking a task, project, milestone, or habit is optional.
      </p>

      <div style={styles.segment} role="group" aria-label="Timer Mode">
        <button
          type="button"
          style={{
            ...styles.segmentButton,
            ...(mode === "Timer" ? styles.segmentButtonActive : {}),
          }}
          onClick={() => handleModeChange("Timer")}
          aria-pressed={mode === "Timer"}
        >
          Timer
        </button>
        <button
          type="button"
          style={{
            ...styles.segmentButton,
            ...(mode === "Pomodoro" ? styles.segmentButtonActive : {}),
          }}
          onClick={() => handleModeChange("Pomodoro")}
          aria-pressed={mode === "Pomodoro"}
        >
          Pomodoro
        </button>
      </div>

      <div ref={ringStageRef} style={styles.ringStage} role="timer" aria-label={`${countdownText} remaining`} aria-live="off">
        <svg width="100%" height="100%" viewBox={`0 0 ${VIEW_BOX_SIZE} ${VIEW_BOX_SIZE}`} aria-hidden="true">
          <circle
            cx={VIEW_BOX_SIZE / 2}
            cy={VIEW_BOX_SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--bg-inset)"
            strokeWidth={STROKE_WIDTH}
          />
          <circle
            cx={VIEW_BOX_SIZE / 2}
            cy={VIEW_BOX_SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${VIEW_BOX_SIZE / 2} ${VIEW_BOX_SIZE / 2})`}
            style={{ transition: "stroke-dashoffset 0.25s linear" }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {countdownEditDraft === null ? (
            <button
              type="button"
              className="focus-timer-digits"
              style={{
                ...styles.digits,
                padding: 0,
                border: 0,
                borderRadius: "var(--radius-sm)",
                background: "transparent",
                color: "var(--text-primary)",
                cursor: isRunning ? "default" : "text",
                ...(countdownFontSize !== null ? { fontSize: countdownFontSize } : {}),
              }}
              disabled={isRunning}
              onClick={() => {
                setCountdownEditError("");
                setCountdownEditDraft(countdownText);
              }}
              aria-label={`Remaining Time ${countdownText}. Activate to edit in minutes and seconds.`}
              title={isRunning ? "Pause the timer to edit the duration" : "Edit remaining time"}
            >
              <span ref={digitsRef}>{countdownText}</span>
            </button>
          ) : (
            <input
              ref={countdownEditInputRef}
              type="text"
              className="focus-timer-digits"
              style={{
                ...styles.digits,
                boxSizing: "content-box",
                width: `${Math.max(5, countdownEditDraft.length)}ch`,
                maxWidth: "80%",
                padding: "2px 6px",
                border: 0,
                outline: "none",
                boxShadow: "none",
                background: "transparent",
                color: "var(--text-primary)",
                textAlign: "center",
                fontVariantNumeric: "tabular-nums",
                ...(countdownFontSize !== null ? { fontSize: countdownFontSize } : {}),
              }}
              value={countdownEditDraft}
              onChange={(event) => {
                setCountdownEditError("");
                setCountdownEditDraft(event.target.value);
              }}
              onBlur={(event) => {
                if (cancelCountdownEditRef.current) {
                  cancelCountdownEditRef.current = false;
                  return;
                }
                commitCountdownEdit(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  cancelCountdownEditRef.current = true;
                  setCountdownEditDraft(null);
                  event.currentTarget.blur();
                }
              }}
              aria-label="Set remaining time in minutes or minutes:seconds, from 1 to 999 minutes"
              aria-invalid={countdownEditError !== ""}
              aria-describedby={countdownEditError !== "" ? "countdown-edit-error" : undefined}
              autoComplete="off"
              inputMode="text"
            />
          )}
        </div>
      </div>
      {countdownEditError !== "" && (
        <p id="countdown-edit-error" role="alert" style={{ color: "var(--color-danger)", textAlign: "center" }}>
          {countdownEditError}
        </p>
      )}
      {mode === "Pomodoro" && (
        <>
          <p style={styles.phaseLine}>
            {pomodoroSession === "Focus" ? `Focusing · ${pomodoroDurationLabel}` : `On Break · ${pomodoroDurationLabel}`}
            {isRunning ? " · Running" : isPaused ? " · Paused" : ""}
          </p>
          <div style={styles.dots} aria-label={`${filledDots} of 4 sessions in this round`}>
            {pomodoroDots.map((dot) => (
              <span
                key={dot}
                style={{ ...styles.dot, ...(dot < filledDots ? styles.dotFilled : {}) }}
              />
            ))}
          </div>
        </>
      )}

      <p style={styles.contextLine} aria-live="polite">
        <span style={styles.contextStrong}>{linkedLabel}</span>
        {selectedTask && selectedTaskContextParts.length > 0 && (
          <span style={styles.contextMeta}> · {selectedTaskContextParts.join(" › ")}</span>
        )}
        {!selectedTask && selectedHabit && (
          <span style={styles.contextMeta}> · Habit</span>
        )}
        {showTaskCompleteAffordance && (
          <>
            {" · "}
            <button
              type="button"
              style={styles.inlineAction}
              onClick={() => onCompleteTask?.(selectedTask.id)}
              aria-label={`Mark Task ${selectedTask.title} Complete`}
            >
              Mark Complete
            </button>
          </>
        )}
        {lastSessionTaskId === selectedTask?.id && selectedTask?.completed && (
          <span style={styles.contextMeta}> · Task completed</span>
        )}
      </p>

      <div style={styles.primaryRow}>
        <button
          ref={primaryControlRef}
          type="button"
          className="focus-primary-control ui-button ui-button--primary"
          onClick={isRunning ? handlePause : handleStart}
          style={{ minWidth: 160, borderRadius: "var(--radius-pill)" }}
        >
          {primaryButtonText}
        </button>
        <button
          type="button"
          className="ui-button ui-button--ghost"
          onClick={handleReset}
          style={{ borderRadius: "var(--radius-pill)" }}
        >
          Reset
        </button>
      </div>

      <div style={styles.adjustRow}>
        <button
          type="button"
          className="timer-adjust-button"
          style={styles.adjustButton}
          onClick={(event) => handleQuickAdjust(-1, event.shiftKey)}
          aria-label={`Decrease remaining time by ${quickAdjustStepMinutes} minute${quickAdjustStepMinutes === 1 ? "" : "s"}`}
          title={`Decrease time by ${quickAdjustStepMinutes} minute${quickAdjustStepMinutes === 1 ? "" : "s"} (Shift: 1 minute)`}
        >
          <Minus size={16} />
          {quickAdjustStepMinutes}m
        </button>
        <button
          type="button"
          className="timer-adjust-button"
          style={styles.adjustButton}
          onClick={(event) => handleQuickAdjust(1, event.shiftKey)}
          aria-label={`Increase remaining time by ${quickAdjustStepMinutes} minute${quickAdjustStepMinutes === 1 ? "" : "s"}`}
          title={`Increase time by ${quickAdjustStepMinutes} minute${quickAdjustStepMinutes === 1 ? "" : "s"} (Shift: 1 minute)`}
        >
          <Plus size={16} />
          {quickAdjustStepMinutes}m
        </button>
      </div>

      <section style={styles.panel} aria-label="Linked Context">
        <h2 style={styles.panelTitle}>Link This Session (Optional)</h2>
        <div style={styles.fieldGrid}>
          <div style={styles.field}>
            <label style={styles.fieldLabel} htmlFor="project-select">
              Project (Optional)
            </label>
            <select
              id="project-select"
              style={styles.select}
              value={selectedProjectId}
              onChange={(event) => handleProjectChange(event.target.value)}
              disabled={isRunning}
              aria-label="Select a Project to Link This Session to"
            >
              <option value="">No Project</option>
              {(projects ?? []).filter((project) => project.status !== "archived").map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.fieldLabel} htmlFor="milestone-select">
              Milestone (Optional)
            </label>
            <select
              id="milestone-select"
              style={styles.select}
              value={selectedMilestoneId}
              onChange={(event) => handleMilestoneChange(event.target.value)}
              disabled={isRunning}
              aria-label="Select a Milestone to Link This Session to"
            >
              <option value="">No Milestone</option>
              {availableMilestones.map((milestone) => (
                <option key={milestone.id} value={milestone.id}>
                  {milestone.title}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={styles.fieldGrid}>
          <div style={styles.field}>
            <label style={styles.fieldLabel} htmlFor="task-select">
              Task (Optional)
            </label>
            <select
              id="task-select"
              style={styles.select}
              value={selectedTaskId}
              onChange={(event) => handleTaskChange(event.target.value)}
              disabled={isRunning}
              aria-label="Select Task"
            >
              <option value="">No Task</option>
              {availableTasks.filter((task) => !task.completed).map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.fieldLabel} htmlFor="habit-select">
              Habit (Optional)
            </label>
            <select
              id="habit-select"
              style={styles.select}
              value={selectedHabitId}
              onChange={(event) =>
                setSelectedHabitId(
                  event.target.value === "" ? "" : Number(event.target.value),
                )
              }
              disabled={isRunning}
              aria-label="Select a Habit to Focus On"
            >
              <option value="">General Focus</option>
              {habits.map((habit) => (
                <option key={habit.id} value={habit.id}>
                  {habit.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <div style={styles.presetRow} role="group" aria-label="Duration Presets">
        {DURATION_PRESETS.map((minutes) => {
          const isActive = activeDurationMs === minutes * 60000;
          return (
            <button
              key={minutes}
              type="button"
              style={{
                ...styles.presetPill,
                ...(isActive ? styles.presetPillActive : {}),
              }}
              onClick={() => handlePreset(minutes)}
              disabled={isRunning}
              aria-pressed={isActive}
            >
              {minutes}m
            </button>
          );
        })}
      </div>

      <section style={styles.panel} aria-label="Duration Settings">
        <h2 style={styles.panelTitle}>Duration</h2>
        {mode === "Timer" ? (
          <div style={styles.durationField}>
            <label style={styles.durationCaption} htmlFor="focus-timer-duration">
              Timer (Minutes)
            </label>
            <input
              id="focus-timer-duration"
              type="number"
              min={1}
              max={MAX_DURATION_MINUTES}
              step={1}
              style={{
                ...styles.durationInput,
                ...(isRunning ? styles.durationInputDisabled : {}),
              }}
              value={timerDurationDraft ?? String(timerMinutes)}
              disabled={isRunning}
              onFocus={() => setTimerDurationDraft(String(timerMinutes))}
              onChange={(event) => {
                const value = event.target.value;
                setTimerDurationDraft(value);
                if (isValidFocusDurationMinutes(value)) handleTimerDurationChange(value);
              }}
              onBlur={() => {
                const value = timerDurationDraft ?? String(timerMinutes);
                if (value !== String(timerMinutes) && isValidFocusDurationMinutes(value)) {
                  handleTimerDurationChange(value);
                }
                setTimerDurationDraft(null);
              }}
            />
          </div>
        ) : (
          <div style={styles.durationGrid}>
            <div style={styles.durationField}>
              <label style={styles.durationCaption} htmlFor="focus-duration">
                Focus (Minutes)
              </label>
              <input
                id="focus-duration"
                type="number"
                min={1}
                max={MAX_DURATION_MINUTES}
                step={1}
                style={{
                  ...styles.durationInput,
                  ...(isRunning ? styles.durationInputDisabled : {}),
                }}
                value={focusDurationDraft ?? String(focusMinutes)}
                disabled={isRunning}
                onFocus={() => setFocusDurationDraft(String(focusMinutes))}
                onChange={(event) => {
                  const value = event.target.value;
                  setFocusDurationDraft(value);
                  if (isValidFocusDurationMinutes(value)) handleFocusDurationChange(value);
                }}
                onBlur={() => {
                  const value = focusDurationDraft ?? String(focusMinutes);
                  if (value !== String(focusMinutes) && isValidFocusDurationMinutes(value)) {
                    handleFocusDurationChange(value);
                  }
                  setFocusDurationDraft(null);
                }}
              />
            </div>
            <div style={styles.durationField}>
              <label style={styles.durationCaption} htmlFor="break-duration">
                Break (Minutes)
              </label>
              <input
                id="break-duration"
                type="number"
                min={1}
                max={MAX_DURATION_MINUTES}
                step={1}
                style={{
                  ...styles.durationInput,
                  ...(isRunning ? styles.durationInputDisabled : {}),
                }}
                value={breakDurationDraft ?? String(breakMinutes)}
                disabled={isRunning}
                onFocus={() => setBreakDurationDraft(String(breakMinutes))}
                onChange={(event) => {
                  const value = event.target.value;
                  setBreakDurationDraft(value);
                  if (isValidFocusDurationMinutes(value)) handleBreakDurationChange(value);
                }}
                onBlur={() => {
                  const value = breakDurationDraft ?? String(breakMinutes);
                  if (value !== String(breakMinutes) && isValidFocusDurationMinutes(value)) {
                    handleBreakDurationChange(value);
                  }
                  setBreakDurationDraft(null);
                }}
              />
            </div>
          </div>
        )}
        <div style={styles.durationField}>
          <label style={styles.durationCaption} htmlFor="quick-adjust-step">
            Adjust Step (Minutes)
          </label>
          <input
            id="quick-adjust-step"
            type="number"
            min={1}
            max={180}
            step={1}
            style={styles.durationInput}
            value={quickAdjustStepDraft}
            onFocus={() => {
              quickAdjustStepInputFocusedRef.current = true;
            }}
            onChange={(event) => {
              const value = event.target.value;
              setQuickAdjustStepDraft(value);
              const minutes = Number(value);
              if (Number.isInteger(minutes) && minutes >= 1 && minutes <= 180) {
                onQuickAdjustStepChange(minutes);
              }
            }}
            onBlur={() => {
              quickAdjustStepInputFocusedRef.current = false;
              const minutes = Number(quickAdjustStepDraft);
              if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) {
                setQuickAdjustStepDraft(String(quickAdjustStepMinutes));
              }
            }}
            aria-label="Adjust Step in Minutes"
          />
        </div>
        <div style={styles.stepGrid} role="group" aria-label="Quick Adjustment Presets">
          {QUICK_ADJUST_PRESETS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              style={{
                ...styles.presetPill,
                ...(quickAdjustStepMinutes === minutes ? styles.presetPillActive : {}),
              }}
              onClick={() => {
                setQuickAdjustStepDraft(String(minutes));
                onQuickAdjustStepChange(minutes);
              }}
              aria-pressed={quickAdjustStepMinutes === minutes}
            >
              {minutes}m
            </button>
          ))}
        </div>
      </section>

      <p style={styles.todayLine}>
        Today: <span style={styles.todayStrong}>{focusedTodayMinutes}m</span> across{" "}
        <span style={styles.todayStrong}>{sessionsDone}</span> session{sessionsDone === 1 ? "" : "s"}
      </p>
    </div>
  );
}

export default FocusTimer;
