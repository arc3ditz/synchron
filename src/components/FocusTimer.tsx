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
import { getFocusSessionsForLogicalToday } from "../domain/focusTimer";
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
  onTimerShortcutReady?: (handler: (() => boolean) | null) => void;
};

const DEFAULT_BREAK_MINUTES = 5;
const MAX_DURATION_MINUTES = 999;
const RADIUS = 80;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
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
    maxWidth: 720,
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
    maxWidth: "52ch",
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
    fontSize: "clamp(4rem, 12vw, 7rem)",
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
    maxWidth: "56ch",
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
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
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
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "var(--space-3)",
  },
  durationField: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  durationCaption: {
    fontSize: "var(--type-sm)",
    color: "var(--text-secondary)",
  },
  durationInput: {
    ...FORM_CONTROL,
    flex: "0 0 96px",
    width: 96,
    minWidth: 96,
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
  focusMinutes: number,
  breakMinutes: number,
): number {
  if (mode === "Pomodoro") {
    return (session === "Focus" ? focusMinutes : breakMinutes) * 60000;
  }
  return timerMinutes * 60000;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function clampMinutes(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!value.trim() || !Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(MAX_DURATION_MINUTES, Math.round(parsed)));
}

function isValidMinuteInput(value: string): boolean {
  const parsed = Number(value);
  return value.trim() !== "" && Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_DURATION_MINUTES;
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
  onTimerShortcutReady,
}: FocusTimerProps) {
  const [mode, setMode] = useState<Mode>("Timer");
  const [timerMinutes, setTimerMinutes] = useState(defaultFocusDuration);
  const [focusMinutes, setFocusMinutes] = useState(defaultFocusDuration);
  const [breakMinutes, setBreakMinutes] = useState(DEFAULT_BREAK_MINUTES);
  const [timerRemainingMs, setTimerRemainingMs] = useState(
    defaultFocusDuration * 60000,
  );
  const [timerTotalMs, setTimerTotalMs] = useState(defaultFocusDuration * 60000);
  const [pomodoroRemainingMs, setPomodoroRemainingMs] = useState(
    defaultFocusDuration * 60000,
  );
  const [pomodoroTotalMs, setPomodoroTotalMs] = useState(defaultFocusDuration * 60000);
  const [timerRunning, setTimerRunning] = useState(false);
  const [pomodoroRunning, setPomodoroRunning] = useState(false);
  const [pomodoroSession, setPomodoroSession] = useState<Session>("Focus");
  const [selectedHabitId, setSelectedHabitId] = useState<number | "">("");
  // Legacy goal link preserved on records only; no Goal selector in the UI.
  const [selectedGoalId, setSelectedGoalId] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
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

  const timerEndTimestampRef = useRef<number | null>(null);
  const pomodoroEndTimestampRef = useRef<number | null>(null);
  const timerRunningRef = useRef(false);
  const pomodoroRunningRef = useRef(false);
  const pomodoroSessionRef = useRef<Session>("Focus");
  const timerRemainingRef = useRef(defaultFocusDuration * 60000);
  const pomodoroRemainingRef = useRef(defaultFocusDuration * 60000);
  const timerTotalMsRef = useRef(defaultFocusDuration * 60000);
  const pomodoroTotalMsRef = useRef(defaultFocusDuration * 60000);
  const timerMinutesRef = useRef(defaultFocusDuration);
  const focusMinutesRef = useRef(defaultFocusDuration);
  const appliedDefaultFocusDurationRef = useRef(defaultFocusDuration);
  const breakMinutesRef = useRef(DEFAULT_BREAK_MINUTES);
  const updateTimerRef = useRef<(now: number) => void>(() => {});
  const updatePomodoroRef = useRef<(now: number) => void>(() => {});
  const quickAdjustStepInputFocusedRef = useRef(false);
  const primaryControlRef = useRef<HTMLButtonElement>(null);

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
      if (pomodoroSessionRef.current === "Focus") {
        updatePomodoroTotalMs(defaultFocusDuration * 60000);
        setPomodoroState(defaultFocusDuration * 60000, false, "Focus");
      }
    }
  }, [defaultFocusDuration]);

  // Track the last logged session to prevent duplicate entries
  const lastLoggedSessionRef = useRef<{ mode: Mode; session: Session; endTimestamp: number } | null>(null);

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

  function shouldLogSession(mode: Mode, session: Session, endTimestamp: number): boolean {
    const lastLogged = lastLoggedSessionRef.current;
    if (!lastLogged) return true;

    // Don't log if it's the same session completion we already logged
    return lastLogged.mode !== mode || lastLogged.session !== session || lastLogged.endTimestamp !== endTimestamp;
  }

  function markSessionLogged(mode: Mode, session: Session, endTimestamp: number) {
    lastLoggedSessionRef.current = { mode, session, endTimestamp };
  }

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

      // Log the completed Timer session
      if (shouldLogSession("Timer", "Focus", end)) {
        handleSessionComplete(
          "Timer",
          Math.round(timerTotalMsRef.current / 60000),
          getSelectedHabitName(),
        );
        markSessionLogged("Timer", "Focus", end);
      }

      playSfx("timerComplete");
      void notifyTimerFinished();
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
        handleSessionComplete(
          "Pomodoro Focus",
          Math.round(sessionTotalMs / 60000),
          getSelectedHabitName(),
        );
        markSessionLogged("Pomodoro", "Focus", sessionEndTimestamp);
      }

      sessionTotalMs = getSessionTotalMs(
        "Pomodoro",
        currentSession,
        timerMinutesRef.current,
        focusMinutesRef.current,
        breakMinutesRef.current,
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

    // Match the Start/Resume button label below: resuming partial progress
    // plays the resume sound, while a full bar is always a fresh start.
    // Deriving this from remaining/total (instead of a flag) keeps the
    // sound correct across completions, resets, duration changes, and modes.
    const startRemainingMs = mode === "Timer" ? timerRemainingRef.current : pomodoroRemainingRef.current;
    const startTotalMs = mode === "Timer" ? timerTotalMsRef.current : pomodoroTotalMsRef.current;
    playSfx(startRemainingMs > 0 && startRemainingMs < startTotalMs ? "pauseResume" : "start");

    const now = Date.now();
    if (mode === "Timer") {
      if (timerRemainingRef.current <= 0) return;
      timerEndTimestampRef.current = now + timerRemainingRef.current;
      setTimerState(timerRemainingRef.current, true);
    } else {
      if (pomodoroRemainingRef.current <= 0) return;
      pomodoroEndTimestampRef.current = now + pomodoroRemainingRef.current;
      setPomodoroState(
        pomodoroRemainingRef.current,
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
      const totalMs = timerMinutesRef.current * 60000;
      updateTimerTotalMs(totalMs);
      timerEndTimestampRef.current = null;
      setTimerState(totalMs, false);
    } else {
      const totalMs = getSessionTotalMs(
        "Pomodoro",
        pomodoroSessionRef.current,
        timerMinutesRef.current,
        focusMinutesRef.current,
        breakMinutesRef.current,
      );
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
    const parsed = clampMinutes(value, defaultFocusDuration);
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

    const durationMinutes = Math.max(1, Math.min(MAX_DURATION_MINUTES, autoStartAction.durationMinutes ?? defaultFocusDuration));
    const frameId = window.requestAnimationFrame(() => {
      handleTimerDurationChange(String(durationMinutes));
      handleStart();
      onAutoStartHandled?.();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [autoStartAction, defaultFocusDuration, handleStart, handleTimerDurationChange, mode, onAutoStartHandled]);

  function handleFocusDurationChange(value: string) {
    const parsed = clampMinutes(value, defaultFocusDuration);
    focusMinutesRef.current = parsed;
    setFocusMinutes(parsed);
    if (!pomodoroRunningRef.current && pomodoroSessionRef.current === "Focus") {
      updatePomodoroTotalMs(parsed * 60000);
      setPomodoroState(parsed * 60000, false, "Focus");
    }
  }

  function handleBreakDurationChange(value: string) {
    const parsed = clampMinutes(value, DEFAULT_BREAK_MINUTES);
    breakMinutesRef.current = parsed;
    setBreakMinutes(parsed);
    if (!pomodoroRunningRef.current && pomodoroSessionRef.current === "Break") {
      updatePomodoroTotalMs(parsed * 60000);
      setPomodoroState(parsed * 60000, false, "Break");
    }
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
      if (timerRunningRef.current) updateTimerRef.current(now);
      if (pomodoroRunningRef.current) updatePomodoroRef.current(now);
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

  const isRunning = mode === "Timer" ? timerRunning : pomodoroRunning;
  const remainingMs = mode === "Timer" ? timerRemainingMs : pomodoroRemainingMs;
  const initialDurationMs = mode === "Timer" ? timerTotalMs : pomodoroTotalMs;
  const fraction = initialDurationMs > 0 ? Math.min(1, Math.max(0, remainingMs / initialDurationMs)) : 0;
  const dashOffset = CIRCUMFERENCE * (1 - fraction);

  // Determine button text: "Start" for fresh/completed state, "Resume" for paused state
  const isPaused = !isRunning && remainingMs > 0 && remainingMs < initialDurationMs;
  const primaryButtonText = isRunning ? "Pause" : isPaused ? "Resume" : "Start";
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
      : "Nothing linked yet";
  const activeMinutes = mode === "Timer" ? timerMinutes : focusMinutes;

  return (
    <div style={styles.stage}>
      <div>
        <p style={styles.eyebrow}>Focus</p>
        <h1 style={styles.title}>Settle in for one session</h1>
      </div>
      <p style={styles.sub}>
        A single quiet timer. Link a task, habit, milestone, or project, then press Start.
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

      <div style={styles.ringStage} role="timer" aria-label={`${formatTime(remainingMs)} remaining`} aria-live="off">
        <svg width="100%" height="100%" viewBox="0 0 200 200" aria-hidden="true">
          <circle
            cx={100}
            cy={100}
            r={RADIUS}
            fill="none"
            stroke="var(--bg-inset)"
            strokeWidth={5}
          />
          <circle
            cx={100}
            cy={100}
            r={RADIUS}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 100 100)"
            style={{ transition: "stroke-dashoffset 0.25s linear" }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span className="focus-timer-digits" style={styles.digits}>
            {formatTime(remainingMs)}
          </span>
        </div>
      </div>

      {mode === "Pomodoro" && (
        <>
          <p style={styles.phaseLine}>
            {pomodoroSession === "Focus" ? `Focusing · ${focusMinutes}m` : `On break · ${breakMinutes}m`}
            {isRunning ? " · running" : isPaused ? " · paused" : ""}
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
          <span style={styles.contextMeta}> · habit</span>
        )}
        {showTaskCompleteAffordance && (
          <>
            {" · "}
            <button
              type="button"
              style={styles.inlineAction}
              onClick={() => onCompleteTask?.(selectedTask.id)}
              aria-label={`Mark task ${selectedTask.title} complete`}
            >
              Mark complete
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
          disabled={!isRunning && remainingMs <= 0}
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

      <div style={styles.presetRow} role="group" aria-label="Duration Presets">
        {DURATION_PRESETS.map((minutes) => {
          const isActive = activeMinutes === minutes;
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

      <section style={styles.panel} aria-label="Linked context">
        <h2 style={styles.panelTitle}>Link this session</h2>
        <div style={styles.fieldGrid}>
          <div style={styles.field}>
            <label style={styles.fieldLabel} htmlFor="project-select">
              Project (optional)
            </label>
            <select
              id="project-select"
              style={styles.select}
              value={selectedProjectId}
              onChange={(event) => handleProjectChange(event.target.value)}
              disabled={isRunning}
              aria-label="Select a Project to Link This Session to"
            >
              <option value="">No project</option>
              {(projects ?? []).filter((project) => project.status !== "archived").map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.fieldLabel} htmlFor="milestone-select">
              Milestone (optional)
            </label>
            <select
              id="milestone-select"
              style={styles.select}
              value={selectedMilestoneId}
              onChange={(event) => handleMilestoneChange(event.target.value)}
              disabled={isRunning}
              aria-label="Select a Milestone to Link This Session to"
            >
              <option value="">No milestone</option>
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
              Task (optional)
            </label>
            <select
              id="task-select"
              style={styles.select}
              value={selectedTaskId}
              onChange={(event) => handleTaskChange(event.target.value)}
              disabled={isRunning}
              aria-label="Select Task"
            >
              <option value="">No task</option>
              {availableTasks.filter((task) => !task.completed).map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.fieldLabel} htmlFor="habit-select">
              Habit (optional)
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
              <option value="">General focus</option>
              {habits.map((habit) => (
                <option key={habit.id} value={habit.id}>
                  {habit.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section style={styles.panel} aria-label="Duration settings">
        <h2 style={styles.panelTitle}>Duration</h2>
        {mode === "Timer" ? (
          <div style={styles.durationField}>
            <label style={styles.durationCaption} htmlFor="focus-timer-duration">
              Timer (minutes)
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
                if (isValidMinuteInput(value)) handleTimerDurationChange(value);
              }}
              onBlur={() => {
                const value = clampMinutes(timerDurationDraft ?? String(timerMinutes), timerMinutes);
                handleTimerDurationChange(String(value));
                setTimerDurationDraft(null);
              }}
            />
          </div>
        ) : (
          <div style={styles.durationGrid}>
            <div style={styles.durationField}>
              <label style={styles.durationCaption} htmlFor="focus-duration">
                Focus (minutes)
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
                  if (isValidMinuteInput(value)) handleFocusDurationChange(value);
                }}
                onBlur={() => {
                  const value = clampMinutes(focusDurationDraft ?? String(focusMinutes), focusMinutes);
                  handleFocusDurationChange(String(value));
                  setFocusDurationDraft(null);
                }}
              />
            </div>
            <div style={styles.durationField}>
              <label style={styles.durationCaption} htmlFor="break-duration">
                Break (minutes)
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
                  if (isValidMinuteInput(value)) handleBreakDurationChange(value);
                }}
                onBlur={() => {
                  const value = clampMinutes(breakDurationDraft ?? String(breakMinutes), breakMinutes);
                  handleBreakDurationChange(String(value));
                  setBreakDurationDraft(null);
                }}
              />
            </div>
          </div>
        )}
        <div style={styles.durationField}>
          <label style={styles.durationCaption} htmlFor="quick-adjust-step">
            Adjust step (minutes)
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
