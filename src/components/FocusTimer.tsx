import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Minus, Plus } from "lucide-react";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

import { CARD_SURFACE } from "../theme";
import type { Mode, Session, FocusTimerHabit, Goal, Milestone, Task, Habit } from "../types";
import { registerFocusTimerRunningState } from "../domain/notificationLogic";

type FocusTimerProps = {
  habits: FocusTimerHabit[];
  focusSessions: { timestamp: number; durationMinutes: number }[];
  onSessionComplete: (sessionType: "Timer" | "Pomodoro Focus", durationMinutes: number, habitName: string, goalId?: string, milestoneId?: string, taskId?: string, habitId?: number) => void;
  defaultFocusDuration: number;
  quickAdjustStepMinutes: number;
  onQuickAdjustStepChange: (minutes: number) => void;
  soundAlerts: boolean;
  goals: Goal[];
  milestones: Milestone[];
  tasks: Task[];
  allHabits?: Habit[];
  initialEntityId?: { taskId?: string; habitId?: number; goalId?: string; title?: string };
  autoStartAction?: { habitId?: number; title?: string; durationMinutes?: number } | null;
  onAutoStartHandled?: () => void;
};

const DEFAULT_BREAK_MINUTES = 5;
const MAX_DURATION_MINUTES = 999;
const MAX_DURATION_MS = MAX_DURATION_MINUTES * 60000;
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
  mainSection: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
    minWidth: 0,
    gap: 24,
  },
  header: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  title: {
    fontSize: 20,
    fontWeight: 600,
    color: "var(--text-primary)",
    margin: 0,
  },
  modeToggle: {
    display: "flex",
    gap: 4,
    background: "var(--bg-inset)",
    border: "1px solid var(--border-color)",
    borderRadius: 20,
    padding: 3,
  },
  modeButton: {
    background: "transparent",
    border: "none",
    borderRadius: 16,
    padding: "8px 18px",
    fontSize: 14,
    fontWeight: 500,
    color: "var(--text-secondary)",
    cursor: "pointer",
  },
  modeButtonActive: {
    background: "rgba(var(--accent-rgb), 0.1)",
    color: "var(--accent-teal)",
  },
  sessionBadge: {
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 20,
    padding: "6px 16px",
    letterSpacing: 0.3,
    whiteSpace: "nowrap",
  },
  sessionFocus: {
    color: "var(--accent-teal)",
    background: "rgba(var(--accent-rgb), 0.08)",
    border: "1px solid rgba(var(--accent-rgb), 0.3)",
  },
  sessionBreak: {
    color: "var(--text-secondary)",
    background: "transparent",
    border: "1px solid var(--border-strong)",
  },
  ringWrapper: {
    position: "relative",
    width: "min(100%, 360px)",
    height: "auto",
    aspectRatio: "1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  ringLabel: {
    fontSize: 54,
    flex: "0 0 auto",
    fontWeight: 600,
    color: "var(--text-primary)",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  timerReadout: {
    position: "absolute",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    maxWidth: "100%",
  },
  timerAdjustButton: {
    flex: "0 0 32px",
    width: 32,
    height: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    background: "var(--card-surface-bg)",
    border: "1px solid var(--card-surface-border)",
    borderRadius: "50%",
    color: "#e4e4e7",
    cursor: "pointer",
    transition: "transform 0.15s ease, color 0.15s ease, border-color 0.15s ease",
  },
  durationRow: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    minWidth: 0,
  },
  durationGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    width: "100%",
  },
  durationFieldRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 10,
    minWidth: 0,
  },
  durationCaption: {
    fontSize: 14,
    color: "var(--text-secondary)",
  },
  durationInputField: {
    flex: "0 0 96px",
    width: 96,
    minWidth: 96,
    background: "var(--card-surface-bg)",
    border: "1px solid var(--card-surface-border)",
    borderRadius: 8,
    padding: "8px 10px",
    color: "var(--text-primary)",
    fontSize: 15,
    outline: "none",
  },
  durationInputFieldDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  stepPresetGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 6,
  },
  presetButtonActive: {
    background: "rgba(var(--accent-rgb), 0.1)",
    border: "1px solid rgba(var(--accent-rgb), 0.42)",
    color: "var(--accent-teal)",
  },
  controlsRow: {
    display: "flex",
    gap: 8,
    width: "100%",
    maxWidth: 420,
  },
  primaryButton: {
    flex: 1,
    background: "linear-gradient(135deg, var(--accent-teal-soft), var(--accent-teal))",
    border: "1px solid rgba(var(--accent-rgb), 0.65)",
    borderRadius: 12,
    padding: "13px 16px",
    fontSize: 15,
    fontWeight: 600,
    color: "var(--bg-primary)",
    cursor: "pointer",
    boxShadow: "0 6px 20px rgba(var(--accent-rgb), 0.16)",
    transition: "transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease",
  },
  primaryButtonDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  secondaryButton: {
    flex: 1,
    background: "var(--bg-surface)",
    border: "1px solid var(--card-surface-border)",
    borderRadius: 12,
    padding: "13px 16px",
    fontSize: 15,
    fontWeight: 500,
    color: "var(--text-secondary)",
    cursor: "pointer",
    transition: "background 0.15s ease, border-color 0.15s ease, color 0.15s ease",
  },
  habitSelectRow: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    width: "100%",
  },
  habitSelectLabel: {
    fontSize: 13,
    color: "var(--text-secondary)",
  },
  habitSelect: {
    width: "100%",
    background: "var(--card-surface-bg)",
    border: "1px solid var(--card-surface-border)",
    borderRadius: 8,
    padding: "8px 12px",
    color: "var(--text-body)",
    fontSize: 14,
    outline: "none",
    cursor: "pointer",
  },
  controlPanel: {
    ...CARD_SURFACE,
    background: "color-mix(in srgb, var(--bg-surface) 88%, transparent)",
    borderRadius: 16,
    backdropFilter: "blur(16px)",
    display: "flex",
    flexDirection: "column",
    gap: 24,
    padding: 24,
    width: "100%",
  },
  panelSection: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  panelCard: {
    padding: 14,
    background: "color-mix(in srgb, var(--bg-surface) 72%, transparent)",
    border: "1px solid var(--card-surface-border)",
    borderRadius: 12,
  },
  panelSectionTitle: {
    margin: 0,
    color: "var(--text-primary)",
    fontSize: 13,
    fontWeight: 600,
  },
  presetGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 8,
  },
  presetButton: {
    background: "transparent",
    border: "1px solid var(--card-surface-border)",
    borderRadius: 20,
    padding: "8px 10px",
    color: "var(--text-secondary)",
    fontSize: 13,
    cursor: "pointer",
  },
  overviewGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 8,
  },
  overviewCard: {
    ...CARD_SURFACE,
    padding: 12,
  },
  overviewLabel: {
    display: "block",
    color: "var(--text-secondary)",
    fontSize: 11,
    lineHeight: 1.35,
  },
  overviewValue: {
    display: "block",
    marginTop: 6,
    color: "var(--accent-teal)",
    fontSize: 20,
    fontWeight: 600,
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

// Minimal cross-browser handle for the (still vendor-prefixed in old
// Safari) AudioContext constructor.
type AudioContextConstructor = typeof AudioContext;
function getAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const win = window as typeof window & { webkitAudioContext?: AudioContextConstructor };
  return win.AudioContext ?? win.webkitAudioContext ?? null;
}

function FocusTimer({
  habits,
  focusSessions,
  onSessionComplete,
  defaultFocusDuration,
  quickAdjustStepMinutes,
  onQuickAdjustStepChange,
  soundAlerts,
  goals,
  milestones,
  tasks,
  allHabits,
  initialEntityId,
  autoStartAction,
  onAutoStartHandled,
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
  const [selectedGoalId, setSelectedGoalId] = useState<string>("");
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [previousInitialEntityId, setPreviousInitialEntityId] = useState(initialEntityId);
  const [timerDurationDraft, setTimerDurationDraft] = useState<string | null>(null);
  const [focusDurationDraft, setFocusDurationDraft] = useState<string | null>(null);
  const [breakDurationDraft, setBreakDurationDraft] = useState<string | null>(null);
  const [quickAdjustStepDraft, setQuickAdjustStepDraft] = useState(String(quickAdjustStepMinutes));

  if (initialEntityId !== previousInitialEntityId) {
    setPreviousInitialEntityId(initialEntityId);
    if (initialEntityId?.taskId) {
      setSelectedTaskId(initialEntityId.taskId);
      const task = tasks.find((item) => item.id === initialEntityId.taskId);
      setSelectedGoalId(task?.goalId ?? "");
      setSelectedMilestoneId(task?.milestoneId ?? "");
      setSelectedHabitId("");
    } else if (initialEntityId?.habitId) {
      setSelectedHabitId(initialEntityId.habitId);
      const habit = allHabits?.find((item) => item.id === initialEntityId.habitId);
      setSelectedGoalId(habit?.goalId ?? "");
      setSelectedMilestoneId("");
      setSelectedTaskId("");
    } else if (initialEntityId?.goalId) {
      setSelectedGoalId(initialEntityId.goalId);
      setSelectedMilestoneId("");
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

  function handleGoalChange(goalId: string) {
    setSelectedGoalId(goalId);
    setSelectedMilestoneId("");
    setSelectedTaskId("");
  }

  function handleMilestoneChange(milestoneId: string) {
    setSelectedMilestoneId(milestoneId);
    setSelectedTaskId("");
  }

  function handleTaskChange(taskId: string) {
    setSelectedTaskId(taskId);
  }

  const activeGoalIds = new Set(goals.filter((goal) => goal.status === "active").map((goal) => goal.id));
  const availableMilestones = selectedGoalId
    ? milestones.filter(
      (milestone) => activeGoalIds.has(milestone.goalId) && milestone.goalId === selectedGoalId,
    )
    : [];
  const availableTasks = selectedMilestoneId
    ? tasks.filter((task) => task.milestoneId === selectedMilestoneId)
    : [];

  function shouldLogSession(mode: Mode, session: Session, endTimestamp: number): boolean {
    const lastLogged = lastLoggedSessionRef.current;
    if (!lastLogged) return true;
    
    // Don't log if it's the same session completion we already logged
    return lastLogged.mode !== mode || lastLogged.session !== session || lastLogged.endTimestamp !== endTimestamp;
  }

  function markSessionLogged(mode: Mode, session: Session, endTimestamp: number) {
    lastLoggedSessionRef.current = { mode, session, endTimestamp };
  }

  // A single shared AudioContext, created lazily on the first user
  // gesture (Start) so autoplay-blocking browsers don't refuse it.
  const audioContextRef = useRef<AudioContext | null>(null);

  function getAudioContext(): AudioContext | null {
    const Ctor = getAudioContextConstructor();
    if (!Ctor) return null;
    if (!audioContextRef.current) {
      audioContextRef.current = new Ctor();
    }
    return audioContextRef.current;
  }

  // Called from Start (a real user gesture) so the context is already
  // running by the time a session actually ends, possibly while the
  // tab is backgrounded and no new gesture is available.
  const primeAudioContext = useCallback(() => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {
        // Autoplay was blocked; the chime simply won't play this run.
      });
    }
  }, []);

  function playTone(ctx: AudioContext, frequency: number, startTime: number, duration: number) {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(0.18, startTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.05);
  }

  // A gentle two-tone chime (a soft rising interval), built purely
  // from oscillators — no audio files involved.
  function playChime() {
    const ctx = getAudioContext();
    if (!ctx) return;

    const fire = () => {
      const now = ctx.currentTime;
      playTone(ctx, 880, now, 0.22); // A5
      playTone(ctx, 1174.66, now + 0.22, 0.28); // D6
    };

    if (ctx.state === "suspended") {
      ctx.resume().then(fire).catch(() => {
        // Blocked without a fresh gesture; skip this chime silently.
      });
    } else {
      fire();
    }
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
      
      if (soundAlerts) playChime();
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
      if (soundAlerts) playChime();
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
    primeAudioContext();

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
  }, [mode, primeAudioContext, requestNotificationPermissionIfNeeded]);

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
  }

  function handleReset() {
    if (mode === "Timer") {
      timerMinutesRef.current = defaultFocusDuration;
      setTimerMinutes(defaultFocusDuration);
      updateTimerTotalMs(defaultFocusDuration * 60000);
      timerEndTimestampRef.current = null;
      setTimerState(defaultFocusDuration * 60000, false);
    } else {
      focusMinutesRef.current = defaultFocusDuration;
      setFocusMinutes(defaultFocusDuration);
      const totalMs = getSessionTotalMs(
        "Pomodoro",
        pomodoroSessionRef.current,
        timerMinutesRef.current,
        defaultFocusDuration,
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

    const durationMinutes = Math.max(1, Math.min(MAX_DURATION_MINUTES, autoStartAction.durationMinutes ?? defaultFocusDuration));
    const frameId = window.requestAnimationFrame(() => {
      setMode("Timer");
      handleTimerDurationChange(String(durationMinutes));
      handleStart();
      onAutoStartHandled?.();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [autoStartAction, defaultFocusDuration, handleStart, handleTimerDurationChange, onAutoStartHandled]);

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
      const elapsedMs = Math.max(0, timerTotalMsRef.current - previousRemaining);
      const maxRemainingMs = Math.max(0, MAX_DURATION_MS - elapsedMs);
      const nextRemaining = Math.max(0, Math.min(maxRemainingMs, previousRemaining + adjustmentMs));
      const nextTotal = elapsedMs + nextRemaining;
      const remainsRunning = timerRunningRef.current && nextRemaining > 0;
      timerEndTimestampRef.current = remainsRunning ? now + nextRemaining : null;
      updateTimerTotalMs(nextTotal);
      setTimerState(nextRemaining, remainsRunning);
      return;
    }

    if (pomodoroRunningRef.current) updatePomodoro(now);
    const previousRemaining = pomodoroRemainingRef.current;
    const elapsedMs = Math.max(0, pomodoroTotalMsRef.current - previousRemaining);
    const maxRemainingMs = Math.max(0, MAX_DURATION_MS - elapsedMs);
    const nextRemaining = Math.max(0, Math.min(maxRemainingMs, previousRemaining + adjustmentMs));
    const nextTotal = elapsedMs + nextRemaining;
    const remainsRunning = pomodoroRunningRef.current && nextRemaining > 0;
    pomodoroEndTimestampRef.current = remainsRunning ? now + nextRemaining : null;
    updatePomodoroTotalMs(nextTotal);
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

  // Release the audio hardware handle when the component finally
  // unmounts (not on every hide — it stays mounted across views).
  useEffect(() => {
    return () => {
      audioContextRef.current?.close().catch(() => {});
    };
  }, []);

  const session = pomodoroSession;
  const isRunning = mode === "Timer" ? timerRunning : pomodoroRunning;
  const remainingMs = mode === "Timer" ? timerRemainingMs : pomodoroRemainingMs;
  const totalMs = mode === "Timer" ? timerTotalMs : pomodoroTotalMs;
  const fraction = totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0;
  const timerLabelFontSize = remainingMs >= 100 * 60000 ? 40 : 54;
  const dashOffset = CIRCUMFERENCE * (1 - fraction);
  const ringColor =
    mode === "Timer"
      ? "var(--accent-amber)"
      : session === "Break"
        ? "var(--text-muted)"
        : "var(--accent-teal)";

  // Determine button text: "Start" for fresh/completed state, "Resume" for paused state
  const isPaused = !isRunning && remainingMs > 0 && remainingMs < totalMs;
  const primaryButtonText = isRunning ? "Pause" : isPaused ? "Resume" : "Start";
  const todayKey = new Date().toDateString();
  const todaySessions = focusSessions.filter(
    (focusSession) => new Date(focusSession.timestamp).toDateString() === todayKey,
  );
  const focusedTodayMinutes = todaySessions.reduce(
    (total, focusSession) => total + focusSession.durationMinutes,
    0,
  );
  const sessionsDone = todaySessions.length;

  return (
    <div className="focus-dashboard">
      <main className="focus-main" style={styles.mainSection}>
        <div style={styles.header}>
          <h2 style={styles.title}>Focus Timer</h2>
          <div style={styles.modeToggle}>
            <button
              style={{
                ...styles.modeButton,
                ...(mode === "Timer" ? styles.modeButtonActive : {}),
              }}
              onClick={() => handleModeChange("Timer")}
            >
              Timer
            </button>
            <button
              style={{
                ...styles.modeButton,
                ...(mode === "Pomodoro" ? styles.modeButtonActive : {}),
              }}
              onClick={() => handleModeChange("Pomodoro")}
            >
              Pomodoro
            </button>
          </div>
          {mode === "Pomodoro" && (
            <span
              style={{
                ...styles.sessionBadge,
                ...(session === "Focus" ? styles.sessionFocus : styles.sessionBreak),
              }}
            >
              {session} Session
            </span>
          )}
        </div>

        <div style={styles.ringWrapper}>
          <svg width="100%" height="100%" viewBox="0 0 200 200">
            <circle
              cx={100}
              cy={100}
              r={RADIUS}
              fill="none"
              stroke={ringColor}
              strokeWidth={10}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 100 100)"
              style={{ transition: "stroke-dashoffset 0.25s linear" }}
            />
          </svg>
          <div style={styles.timerReadout}>
            <button
              type="button"
              className="timer-adjust-button"
              style={styles.timerAdjustButton}
              onClick={(event) => handleQuickAdjust(-1, event.shiftKey)}
              aria-label={`Decrease remaining time by ${quickAdjustStepMinutes} minute${quickAdjustStepMinutes === 1 ? "" : "s"}`}
              title={`Decrease time by ${quickAdjustStepMinutes} minute${quickAdjustStepMinutes === 1 ? "" : "s"} (Shift: 1 minute)`}
            >
              <Minus size={16} />
            </button>
            <span style={{ ...styles.ringLabel, fontSize: timerLabelFontSize }}>
              {formatTime(remainingMs)}
            </span>
            <button
              type="button"
              className="timer-adjust-button"
              style={styles.timerAdjustButton}
              onClick={(event) => handleQuickAdjust(1, event.shiftKey)}
              aria-label={`Increase remaining time by ${quickAdjustStepMinutes} minute${quickAdjustStepMinutes === 1 ? "" : "s"}`}
              title={`Increase time by ${quickAdjustStepMinutes} minute${quickAdjustStepMinutes === 1 ? "" : "s"} (Shift: 1 minute)`}
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        <div style={styles.controlsRow}>
          {!isRunning ? (
            <button
              className="focus-primary-control"
              style={{
                ...styles.primaryButton,
                ...(remainingMs <= 0 ? styles.primaryButtonDisabled : {}),
              }}
              onClick={handleStart}
              disabled={remainingMs <= 0}
            >
              {primaryButtonText}
            </button>
          ) : (
            <button className="focus-primary-control" style={styles.primaryButton} onClick={handlePause}>
              Pause
            </button>
          )}
          <button className="focus-secondary-control" style={styles.secondaryButton} onClick={handleReset}>
            Reset
          </button>
        </div>
      </main>

      <aside className="focus-control-panel" style={styles.controlPanel}>
        <div style={styles.panelSection}>
          <label style={styles.habitSelectLabel} htmlFor="goal-select">
            Link to Goal (Optional)
          </label>
          <select
            id="goal-select"
            style={styles.habitSelect}
            value={selectedGoalId}
            onChange={(event) => handleGoalChange(event.target.value)}
            disabled={isRunning}
            aria-label="Select a goal to link this session to"
          >
            <option value="">No Linked Goal</option>
            {goals.filter((goal) => goal.status === 'active').map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.title}
              </option>
            ))}
          </select>
        </div>

        {selectedGoalId !== "" && (
          <div style={styles.panelSection}>
            <label style={styles.habitSelectLabel} htmlFor="milestone-select">
              Link to Milestone (Optional)
            </label>
            <select
              id="milestone-select"
              style={styles.habitSelect}
              value={selectedMilestoneId}
              onChange={(event) => handleMilestoneChange(event.target.value)}
              disabled={isRunning}
              aria-label="Select a milestone to link this session to"
            >
              <option value="">No Linked Milestone</option>
              {availableMilestones.map((milestone) => (
                <option key={milestone.id} value={milestone.id}>
                  {milestone.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedMilestoneId !== "" && (
          <div style={styles.panelSection}>
            <label style={styles.habitSelectLabel} htmlFor="task-select">
              Link to Task (Optional)
            </label>
            <select
              id="task-select"
              style={styles.habitSelect}
              value={selectedTaskId}
              onChange={(event) => handleTaskChange(event.target.value)}
              disabled={isRunning}
              aria-label="Select a task to link this session to"
            >
              <option value="">No Linked Task</option>
              {availableTasks.filter((task) => !task.completed).map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={styles.panelSection}>
          <label style={styles.habitSelectLabel} htmlFor="habit-select">
            Focus On (Optional)
          </label>
          <select
            id="habit-select"
            style={styles.habitSelect}
            value={selectedHabitId}
            onChange={(event) =>
              setSelectedHabitId(
                event.target.value === "" ? "" : Number(event.target.value),
              )
            }
            disabled={isRunning}
            aria-label="Select a habit to focus on"
          >
            <option value="">General Focus</option>
            {habits.map((habit) => (
              <option key={habit.id} value={habit.id}>
                {habit.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ ...styles.panelSection, ...styles.panelCard }}>
          <h3 style={styles.panelSectionTitle}>Quick Duration</h3>
          <div style={styles.presetGrid}>
            {DURATION_PRESETS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                style={styles.presetButton}
                onClick={() => handlePreset(minutes)}
                disabled={isRunning}
              >
                {minutes}m
              </button>
            ))}
          </div>
        </div>

        <div style={{ ...styles.panelSection, ...styles.panelCard }}>
          <h3 style={styles.panelSectionTitle}>Duration Settings</h3>
          {mode === "Timer" ? (
            <div style={styles.durationRow}>
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
                  ...styles.durationInputField,
                  ...(isRunning ? styles.durationInputFieldDisabled : {}),
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
              <div style={styles.durationFieldRow}>
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
                    ...styles.durationInputField,
                    ...(isRunning ? styles.durationInputFieldDisabled : {}),
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
              <div style={styles.durationFieldRow}>
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
                    ...styles.durationInputField,
                    ...(isRunning ? styles.durationInputFieldDisabled : {}),
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
        </div>

        <div style={{ ...styles.panelSection, ...styles.panelCard }}>
          <h3 style={styles.panelSectionTitle}>Quick Adjustment</h3>
          <div style={styles.durationFieldRow}>
            <label style={styles.durationCaption} htmlFor="quick-adjust-step">
              Adjust Step (Minutes)
            </label>
            <input
              id="quick-adjust-step"
              type="number"
              min={1}
              max={180}
              step={1}
              style={styles.durationInputField}
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
              aria-label="Adjust step in minutes"
            />
          </div>
          <div style={styles.stepPresetGrid} role="group" aria-label="Quick adjustment presets">
            {QUICK_ADJUST_PRESETS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                style={{
                  ...styles.presetButton,
                  ...(quickAdjustStepMinutes === minutes ? styles.presetButtonActive : {}),
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
        </div>

        <div style={styles.panelSection}>
          <h3 style={styles.panelSectionTitle}>Daily Overview</h3>
          <div style={styles.overviewGrid}>
            <div style={styles.overviewCard}>
              <span style={styles.overviewLabel}>Total Focused Today</span>
              <strong style={styles.overviewValue}>{focusedTodayMinutes}m</strong>
            </div>
            <div style={styles.overviewCard}>
              <span style={styles.overviewLabel}>Sessions Done</span>
              <strong style={styles.overviewValue}>{sessionsDone}</strong>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

export default FocusTimer;