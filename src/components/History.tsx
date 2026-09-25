import { useMemo, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, History as HistoryIcon, Trash2 } from "lucide-react";

import { CARD_SURFACE } from "../theme";

export type HistoryHabit = {
  id: number;
  name: string;
  completedDates: string[];
  frequencyType?: "daily" | "weekdays" | "weekends" | "custom";
  customDays?: string[];
};

export type FocusSessionRecord = {
  id: number;
  timestamp: number;
  sessionType: "Timer" | "Pomodoro Focus";
  durationMinutes: number;
  habitName: string;
};

type HistoryProps = {
  habits: HistoryHabit[];
  focusSessions: FocusSessionRecord[];
  onDeleteFocusSession: (id: number) => void;
  streakFreeze: boolean;
};

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: 760,
  },
  title: {
    fontSize: 22,
    fontWeight: 600,
    color: "#e4e4e7",
    margin: "0 0 4px",
  },
  subtitle: {
    fontSize: 14,
    color: "#71717a",
    margin: "0 0 20px",
  },
  select: {
    width: "100%",
    maxWidth: 420,
    background: "#16161a",
    border: "1px solid #303039",
    borderRadius: 8,
    padding: "10px 12px",
    color: "#d4d4d8",
    fontSize: 14,
    outline: "none",
    cursor: "pointer",
  },
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 8,
    margin: "24px 0",
  },
  stat: {
    ...CARD_SURFACE,
    minWidth: 0,
  },
  statLabel: {
    display: "block",
    fontSize: 11,
    color: "#71717a",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  statValue: {
    display: "block",
    fontSize: 18,
    fontWeight: 600,
    color: "#d4d4d8",
  },
  calendar: {
    ...CARD_SURFACE,
  },
  calendarHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },
  monthLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: "#d4d4d8",
  },
  monthButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    background: "transparent",
    border: "1px solid #303039",
    borderRadius: 20,
    color: "#a1a1aa",
    cursor: "pointer",
    padding: 0,
  },
  todayButton: {
    background: "rgba(0, 240, 255, 0.1)",
    border: "1px solid rgba(0, 240, 255, 0.42)",
    borderRadius: 20,
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 500,
    color: "#00f0ff",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  week: {
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    gap: 6,
  },
  weekday: {
    color: "#5c5d63",
    fontSize: 11,
    fontWeight: 600,
    textAlign: "center",
    paddingBottom: 4,
  },
  day: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    aspectRatio: "1",
    minWidth: 0,
    borderRadius: 6,
    color: "#8a8b91",
    fontSize: 13,
  },
  unscheduledDay: {
    color: "#3f3f46",
    background: "rgba(39, 39, 42, 0.35)",
  },
  completedDay: {
    color: "#00f0ff",
    background: "rgba(0, 240, 255, 0.1)",
    border: "1px solid rgba(0, 240, 255, 0.42)",
    fontWeight: 600,
  },
  today: {
    outline: "1px solid rgba(0, 240, 255, 0.5)",
    outlineOffset: -1,
  },
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    color: "#71717a",
    textAlign: "center",
    padding: "44px 20px",
  },
  emptyIcon: {
    color: "#5c5d63",
  },
  emptyTitle: {
    color: "#a1a1aa",
    fontSize: 14,
    fontWeight: 500,
  },
  emptyText: {
    fontSize: 13,
    margin: 0,
  },
  focusSessionsSection: {
    marginTop: 32,
  },
  focusSessionsTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: "#e4e4e7",
    margin: "0 0 12px",
  },
  focusSessionsList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  focusSessionItem: {
    ...CARD_SURFACE,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  focusSessionInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    flex: 1,
    minWidth: 0,
  },
  focusSessionType: {
    fontSize: 13,
    fontWeight: 500,
    color: "#d4d4d8",
  },
  focusSessionMeta: {
    fontSize: 12,
    color: "#71717a",
  },
  focusSessionHabit: {
    fontSize: 12,
    color: "#8a8b91",
  },
  focusSessionDuration: {
    fontSize: 14,
    fontWeight: 600,
    color: "#00f0ff",
    whiteSpace: "nowrap",
  },
  deleteFocusSessionButton: {
    background: "transparent",
    border: "1px solid #303039",
    borderRadius: 20,
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#5c5d63",
    cursor: "pointer",
    padding: 0,
    transition: "color 0.15s ease, border-color 0.15s ease",
    flexShrink: 0,
  },
  noFocusSessions: {
    fontSize: 13,
    color: "#52525b",
    textAlign: "center",
    padding: "20px 0",
  },
};

function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDateKey(key: string, deltaDays: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + deltaDays);
  return getDateKey(date);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isScheduledOnDate(habit: HistoryHabit, dateKey: string): boolean {
  const frequencyType = habit.frequencyType ?? "daily";
  if (frequencyType === "daily") return true;

  const [year, month, day] = dateKey.split("-").map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  if (frequencyType === "weekdays") return weekday >= 1 && weekday <= 5;
  if (frequencyType === "weekends") return weekday === 0 || weekday === 6;
  return habit.customDays?.includes(WEEKDAYS[weekday]) ?? false;
}

function calculateStreak(habit: HistoryHabit, streakFreeze = false): number {
  const dateSet = new Set(habit.completedDates);
  const todayKey = getDateKey(new Date());

  if (habit.frequencyType === "custom" && (habit.customDays?.length ?? 0) === 0) {
    return 0;
  }

  if (streakFreeze) {
    return [...dateSet].filter(
      (date) => date <= todayKey && isScheduledOnDate(habit, date),
    ).length;
  }

  let cursor = dateSet.has(todayKey) ? todayKey : shiftDateKey(todayKey, -1);
  let streak = 0;

  while (true) {
    if (!isScheduledOnDate(habit, cursor)) {
      cursor = shiftDateKey(cursor, -1);
      continue;
    }
    if (!dateSet.has(cursor)) break;
    streak++;
    cursor = shiftDateKey(cursor, -1);
  }

  return streak;
}

function History({ habits, focusSessions, onDeleteFocusSession, streakFreeze }: HistoryProps) {
  const [selectedHabitId, setSelectedHabitId] = useState<number | "">("");
  const [displayedMonth, setDisplayedMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const effectiveSelectedHabitId =
    selectedHabitId !== "" && habits.some((habit) => habit.id === selectedHabitId)
      ? selectedHabitId
      : "";
  const selectedHabit = habits.find((habit) => habit.id === effectiveSelectedHabitId);
  const completedDateSet = useMemo(
    () => new Set(selectedHabit?.completedDates ?? []),
    [selectedHabit],
  );
  const calendarDays = useMemo(() => {
    const year = displayedMonth.getFullYear();
    const month = displayedMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: firstWeekday + daysInMonth }, (_, index) => {
      if (index < firstWeekday) return null;
      return new Date(year, month, index - firstWeekday + 1);
    });
  }, [displayedMonth]);

  const monthPrefix = `${displayedMonth.getFullYear()}-${String(
    displayedMonth.getMonth() + 1,
  ).padStart(2, "0")}`;
  const monthCompletionCount = selectedHabit?.completedDates.filter((date) =>
    date.startsWith(`${monthPrefix}-`),
  ).length ?? 0;
  const hasCompletions = (selectedHabit?.completedDates.length ?? 0) > 0;
  const monthLabel = displayedMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const todayKey = getDateKey(new Date());

  const sortedFocusSessions = useMemo(() => {
    return [...focusSessions].sort((a, b) => b.timestamp - a.timestamp);
  }, [focusSessions]);

  function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function moveMonth(delta: number) {
    setDisplayedMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + delta, 1),
    );
  }

  function jumpToToday() {
    const today = new Date();
    setDisplayedMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>History</h1>
      <p style={styles.subtitle}>Review your completed habit days.</p>

      <select
        style={styles.select}
        value={effectiveSelectedHabitId}
        onChange={(event) =>
          setSelectedHabitId(
            event.target.value === "" ? "" : Number(event.target.value),
          )
        }
        aria-label="Select a habit to view history"
      >
        <option value="">Select a habit</option>
        {habits.map((habit) => (
          <option key={habit.id} value={habit.id}>
            {habit.name}
          </option>
        ))}
      </select>

      {selectedHabit && (
        <div style={styles.stats}>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Current Streak</span>
            <span style={styles.statValue}>{calculateStreak(selectedHabit, streakFreeze)}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Total Completed Days</span>
            <span style={styles.statValue}>{selectedHabit.completedDates.length}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Completion Count</span>
            <span style={styles.statValue}>{monthCompletionCount}</span>
          </div>
        </div>
      )}

      {!selectedHabit || !hasCompletions ? (
        <div style={styles.empty}>
          <HistoryIcon size={22} style={styles.emptyIcon} />
          <span style={styles.emptyTitle}>
            {selectedHabit ? "No completed days yet" : "Choose a habit to begin"}
          </span>
          <p style={styles.emptyText}>
            {selectedHabit
              ? "Completed days will appear here once you mark this habit done."
              : "Select an existing habit to view its completion history."}
          </p>
        </div>
      ) : (
        <div style={styles.calendar}>
          <div style={styles.calendarHeader}>
            <button
              style={styles.monthButton}
              onClick={() => moveMonth(-1)}
              aria-label="Previous month"
            >
              <ChevronLeft size={16} />
            </button>
            <span style={styles.monthLabel}>{monthLabel}</span>
            <button
              style={styles.monthButton}
              onClick={() => moveMonth(1)}
              aria-label="Next month"
            >
              <ChevronRight size={16} />
            </button>
            <button
              style={styles.todayButton}
              onClick={jumpToToday}
              aria-label="Jump to today"
            >
              Today
            </button>
          </div>
          <div style={styles.week}>
            {[
              "Sun",
              "Mon",
              "Tue",
              "Wed",
              "Thu",
              "Fri",
              "Sat",
            ].map((day) => (
              <span key={day} style={styles.weekday}>
                {day}
              </span>
            ))}
            {calendarDays.map((date, index) => {
              const dateKey = date ? getDateKey(date) : `empty-${index}`;
              const isScheduled = date
                ? isScheduledOnDate(selectedHabit, dateKey)
                : false;
              const isCompleted = isScheduled && completedDateSet.has(dateKey);
              const isToday = isScheduled && dateKey === todayKey;
              return (
                <span
                  key={dateKey}
                  style={{
                    ...styles.day,
                    ...(date && !isScheduled ? styles.unscheduledDay : {}),
                    ...(isCompleted ? styles.completedDay : {}),
                    ...(isToday ? styles.today : {}),
                  }}
                >
                  {date?.getDate() ?? ""}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div style={styles.focusSessionsSection}>
        <h3 style={styles.focusSessionsTitle}>Focus Sessions</h3>
        {sortedFocusSessions.length === 0 ? (
          <p style={styles.noFocusSessions}>
            No focus sessions recorded yet. Complete a timer or pomodoro focus session to see it here.
          </p>
        ) : (
          <div style={styles.focusSessionsList}>
            {sortedFocusSessions.map((session) => (
              <div key={session.id} style={styles.focusSessionItem}>
                <div style={styles.focusSessionInfo}>
                  <span style={styles.focusSessionType}>{session.sessionType}</span>
                  <span style={styles.focusSessionMeta}>{formatTimestamp(session.timestamp)}</span>
                  <span style={styles.focusSessionHabit}>{session.habitName}</span>
                </div>
                <span style={styles.focusSessionDuration}>{session.durationMinutes}m</span>
                <button
                  style={styles.deleteFocusSessionButton}
                  onClick={() => onDeleteFocusSession(session.id)}
                  aria-label={`Delete focus session`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default History;