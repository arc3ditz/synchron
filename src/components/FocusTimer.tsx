import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

import { CARD_SURFACE } from "../theme";

type Mode = "Timer" | "Pomodoro";
type Session = "Focus" | "Break";

type Habit = {
  id: number;
  name: string;
};

type FocusTimerProps = {
  habits: Habit[];
  focusSessions: { timestamp: number; durationMinutes: number }[];
  onSessionComplete: (sessionType: "Timer" | "Pomodoro Focus", durationMinutes: number, habitName: string) => void;
};

const DEFAULT_TIMER_MINUTES = 25;
const DEFAULT_FOCUS_MINUTES = 25;
const DEFAULT_BREAK_MINUTES = 5;
const RADIUS = 80;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const DURATION_PRESETS = [15, 25, 45, 60];
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
    color: "#e4e4e7",
    margin: 0,
  },
  modeToggle: {
    display: "flex",
    gap: 4,
    background: "#0f0f11",
    border: "1px solid #232329",
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
    color: "#8a8b91",
    cursor: "pointer",
  },
  modeButtonActive: {
    background: "rgba(0, 240, 255, 0.1)",
    color: "#00f0ff",
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
    color: "#00f0ff",
    background: "rgba(0, 240, 255, 0.08)",
    border: "1px solid rgba(0, 240, 255, 0.3)",
  },
  sessionBreak: {
    color: "#a1a1aa",
    background: "transparent",
    border: "1px solid #303039",
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
    position: "absolute",
    fontSize: 54,
    fontWeight: 600,
    color: "#e4e4e7",
    fontVariantNumeric: "tabular-nums",
  },
  durationRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
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
    gap: 10,
  },
  durationCaption: {
    fontSize: 14,
    color: "#71717a",
  },
  durationInputField: {
    width: 70,
    background: "#0f0f11",
    border: "1px solid #303039",
    borderRadius: 8,
    padding: "8px 10px",
    color: "#e4e4e7",
    fontSize: 15,
    outline: "none",
  },
  durationInputFieldDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  controlsRow: {
    display: "flex",
    gap: 8,
    width: "100%",
    maxWidth: 420,
  },
  primaryButton: {
    flex: 1,
    background: "rgba(0, 240, 255, 0.1)",
    border: "1px solid rgba(0, 240, 255, 0.42)",
    borderRadius: 20,
    padding: "12px 0",
    fontSize: 15,
    fontWeight: 500,
    color: "#00f0ff",
    cursor: "pointer",
  },
  primaryButtonDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  secondaryButton: {
    flex: 1,
    background: "transparent",
    border: "1px solid #303039",
    borderRadius: 20,
    padding: "12px 0",
    fontSize: 15,
    fontWeight: 500,
    color: "#a1a1aa",
    cursor: "pointer",
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
    color: "#71717a",
  },
  habitSelect: {
    width: "100%",
    background: "#0f0f11",
    border: "1px solid #303039",
    borderRadius: 8,
    padding: "8px 12px",
    color: "#d4d4d8",
    fontSize: 14,
    outline: "none",
    cursor: "pointer",
  },
  controlPanel: {
    ...CARD_SURFACE,
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
  panelSectionTitle: {
    margin: 0,
    color: "#e4e4e7",
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
    border: "1px solid #303039",
    borderRadius: 20,
    padding: "8px 10px",
    color: "#a1a1aa",
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
    color: "#71717a",
    fontSize: 11,
    lineHeight: 1.35,
  },
  overviewValue: {
    display: "block",
    marginTop: 6,
    color: "#00f0ff",
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
  return Math.max(1, Math.min(180, Math.round(Number(value)) || fallback));
}

// Minimal cross-browser handle for the (still vendor-prefixed in old
// Safari) AudioContext constructor.
type AudioContextConstructor = typeof AudioContext;
function getAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const win = window as typeof window & { webkitAudioContext?: AudioContextConstructor };
  return win.AudioContext ?? win.webkitAudioContext ?? null;
}

function FocusTimer({ habits, focusSessions, onSessionComplete }: FocusTimerProps) {
  const [mode, setMode] = useState<Mode>("Timer");
  const [timerMinutes, setTimerMinutes] = useState(DEFAULT_TIMER_MINUTES);
  const [focusMinutes, setFocusMinutes] = useState(DEFAULT_FOCUS_MINUTES);
  const [breakMinutes, setBreakMinutes] = useState(DEFAULT_BREAK_MINUTES);
  const [timerRemainingMs, setTimerRemainingMs] = useState(
    DEFAULT_TIMER_MINUTES * 60000,
  );
  const [pomodoroRemainingMs, setPomodoroRemainingMs] = useState(
    DEFAULT_FOCUS_MINUTES * 60000,
  );
  const [timerRunning, setTimerRunning] = useState(false);
  const [pomodoroRunning, setPomodoroRunning] = useState(false);
  const [pomodoroSession, setPomodoroSession] = useState<Session>("Focus");
  const [selectedHabitId, setSelectedHabitId] = useState<number | "">("");

  const timerEndTimestampRef = useRef<number | null>(null);
  const pomodoroEndTimestampRef = useRef<number | null>(null);
  const timerRunningRef = useRef(false);
  const pomodoroRunningRef = useRef(false);
  const pomodoroSessionRef = useRef<Session>("Focus");
  const timerRemainingRef = useRef(DEFAULT_TIMER_MINUTES * 60000);
  const pomodoroRemainingRef = useRef(DEFAULT_FOCUS_MINUTES * 60000);
  const timerMinutesRef = useRef(DEFAULT_TIMER_MINUTES);
  const focusMinutesRef = useRef(DEFAULT_FOCUS_MINUTES);
  const breakMinutesRef = useRef(DEFAULT_BREAK_MINUTES);
  const updateTimerRef = useRef<(now: number) => void>(() => {});
  const updatePomodoroRef = useRef<(now: number) => void>(() => {});

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
    onSessionComplete(sessionType, durationMinutes, habitName);
  }

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
  function primeAudioContext() {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {
        // Autoplay was blocked; the chime simply won't play this run.
      });
    }
  }

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

  function requestNotificationPermissionIfNeeded() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }

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
        handleSessionComplete("Timer", timerMinutesRef.current, getSelectedHabitName());
        markSessionLogged("Timer", "Focus", end);
      }
      
      playChime();
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

    // Advance through every completed session so a suspended tab still
    // lands on the correct Focus or Break session when it resumes.
    while (now >= end) {
      const sessionEndTimestamp = end;
      const sessionCompleting = currentSession;
      currentSession = currentSession === "Focus" ? "Break" : "Focus";
      
      // Log completed Focus sessions only (not Break sessions)
      if (sessionCompleting === "Focus" && shouldLogSession("Pomodoro", "Focus", sessionEndTimestamp)) {
        handleSessionComplete("Pomodoro Focus", focusMinutesRef.current, getSelectedHabitName());
        markSessionLogged("Pomodoro", "Focus", sessionEndTimestamp);
      }
      
      end += getSessionTotalMs(
        "Pomodoro",
        currentSession,
        timerMinutesRef.current,
        focusMinutesRef.current,
        breakMinutesRef.current,
      );
    }

    const remaining = end - now;
    pomodoroEndTimestampRef.current = end;
    pomodoroRemainingRef.current = remaining;
    setPomodoroRemainingMs(remaining);
    if (currentSession !== startingSession) {
      pomodoroSessionRef.current = currentSession;
      setPomodoroSession(currentSession);
      playChime();
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

  function handleStart() {
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
  }

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
      timerEndTimestampRef.current = null;
      setTimerState(timerMinutesRef.current * 60000, false);
    } else {
      pomodoroEndTimestampRef.current = null;
      setPomodoroState(
        getSessionTotalMs(
          "Pomodoro",
          pomodoroSessionRef.current,
          timerMinutesRef.current,
          focusMinutesRef.current,
          breakMinutesRef.current,
        ),
        false,
        pomodoroSessionRef.current,
      );
    }
  }

  function handleModeChange(nextMode: Mode) {
    setMode(nextMode);
  }

  function handleTimerDurationChange(value: string) {
    const parsed = clampMinutes(value, DEFAULT_TIMER_MINUTES);
    timerMinutesRef.current = parsed;
    setTimerMinutes(parsed);
    if (!timerRunningRef.current) {
      setTimerRemainingMs(parsed * 60000);
      timerRemainingRef.current = parsed * 60000;
    }
  }

  function handleFocusDurationChange(value: string) {
    const parsed = clampMinutes(value, DEFAULT_FOCUS_MINUTES);
    focusMinutesRef.current = parsed;
    setFocusMinutes(parsed);
    if (!pomodoroRunningRef.current && pomodoroSessionRef.current === "Focus") {
      setPomodoroRemainingMs(parsed * 60000);
      pomodoroRemainingRef.current = parsed * 60000;
    }
  }

  function handleBreakDurationChange(value: string) {
    const parsed = clampMinutes(value, DEFAULT_BREAK_MINUTES);
    breakMinutesRef.current = parsed;
    setBreakMinutes(parsed);
    if (!pomodoroRunningRef.current && pomodoroSessionRef.current === "Break") {
      setPomodoroRemainingMs(parsed * 60000);
      pomodoroRemainingRef.current = parsed * 60000;
    }
  }

  function handlePreset(minutes: number) {
    if (mode === "Timer") {
      handleTimerDurationChange(String(minutes));
    } else {
      handleFocusDurationChange(String(minutes));
    }
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
  const totalMs = getSessionTotalMs(
    mode,
    session,
    timerMinutes,
    focusMinutes,
    breakMinutes,
  );
  const fraction = totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0;
  const dashOffset = CIRCUMFERENCE * (1 - fraction);
  const ringColor =
    mode === "Timer"
      ? "#f59e0b"
      : session === "Break"
        ? "#71717a"
        : "#00f0ff";

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
              stroke="#232329"
              strokeWidth={10}
            />
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
          <span style={styles.ringLabel}>{formatTime(remainingMs)}</span>
        </div>

        <div style={styles.controlsRow}>
          {!isRunning ? (
            <button
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
            <button style={styles.primaryButton} onClick={handlePause}>
              Pause
            </button>
          )}
          <button style={styles.secondaryButton} onClick={handleReset}>
            Reset
          </button>
        </div>
      </main>

      <aside className="focus-control-panel" style={styles.controlPanel}>
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

        <div style={styles.panelSection}>
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

        <div style={styles.panelSection}>
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
                max={180}
                style={{
                  ...styles.durationInputField,
                  ...(isRunning ? styles.durationInputFieldDisabled : {}),
                }}
                value={timerMinutes}
                disabled={isRunning}
                onChange={(event) => handleTimerDurationChange(event.target.value)}
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
                  max={180}
                  style={{
                    ...styles.durationInputField,
                    ...(isRunning ? styles.durationInputFieldDisabled : {}),
                  }}
                  value={focusMinutes}
                  disabled={isRunning}
                  onChange={(event) => handleFocusDurationChange(event.target.value)}
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
                  max={180}
                  style={{
                    ...styles.durationInputField,
                    ...(isRunning ? styles.durationInputFieldDisabled : {}),
                  }}
                  value={breakMinutes}
                  disabled={isRunning}
                  onChange={(event) => handleBreakDurationChange(event.target.value)}
                />
              </div>
            </div>
          )}
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