import { useMemo, useState, type CSSProperties } from "react";
import { Check, ChevronLeft, ChevronRight, History as HistoryIcon, Trash2 } from "lucide-react";

import { CARD_SURFACE } from "../theme";
import type { HistoryHabit, FocusSessionRecord } from "../types";
import {
  getDateKey,
  getHabitDateKey,
  WEEKDAYS,
  isHabitScheduledOnDate,
  calculateStreak,
  formatFullDate,
} from "../utils/dates";

export type { FocusSessionRecord };

type HistoryProps = {
  habits: HistoryHabit[];
  focusSessions: FocusSessionRecord[];
  viewMode: "grid" | "list";
  onRequestDeleteFocusSession: (id: number) => void;
  streakFreeze: boolean;
  dayResetHour: number;
  weekStart: "Sunday" | "Monday";
};

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: "100%",
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
  },
  title: {
    fontSize: "var(--type-xl)",
    fontWeight: "var(--font-semibold)",
    color: "var(--text-primary)",
    margin: "0 0 4px",
  },
  subtitle: {
    fontSize: "var(--type-sm)",
    color: "var(--text-secondary)",
    margin: "0 0 20px",
  },
  summaryBar: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
    gap: "var(--space-2)",
    margin: "var(--space-5) 0 var(--space-6)",
  },
  summaryCard: {
    minWidth: 0,
    padding: "var(--space-2) 0",
    borderBottom: "1px solid var(--border-color)",
    background: "transparent",
  },
  summaryLabel: {
    display: "block",
    color: "var(--text-secondary)",
    fontSize: 11,
    fontWeight: 500,
    marginBottom: 6,
  },
  summaryValue: {
    display: "block",
    color: "var(--text-primary)",
    fontSize: "var(--type-lg)",
    fontWeight: "var(--font-semibold)",
    fontVariantNumeric: "tabular-nums",
    overflowWrap: "anywhere",
  },
  selectWrapper: {
    display: "flex",
    justifyContent: "center",
    width: "100%",
    marginBottom: 20,
  },
  select: {
    width: "100%",
    maxWidth: 420,
    background: "var(--bg-surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    padding: "10px 14px",
    color: "var(--text-body)",
    fontSize: 14,
    outline: "none",
    cursor: "pointer",
    textAlign: "center",
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
    color: "var(--text-body)",
  },
  monthButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    background: "transparent",
    border: "1px solid var(--border-strong)",
    borderRadius: 20,
    color: "var(--text-secondary)",
    cursor: "pointer",
    padding: 0,
  },
  todayButton: {
    background: "var(--accent-wash)",
    border: "1px solid var(--accent-border)",
    borderRadius: "var(--radius-md)",
    padding: "var(--space-1) var(--space-3)",
    fontSize: "var(--type-xs)",
    fontWeight: "var(--font-medium)",
    color: "var(--color-accent)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  week: {
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    gap: 6,
  },
  weekday: {
    color: "var(--text-secondary)",
    fontSize: 11,
    fontWeight: 600,
    textAlign: "center",
    paddingBottom: 4,
  },
  day: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    aspectRatio: "1",
    minWidth: 0,
    borderRadius: 6,
    color: "var(--text-secondary)",
    fontSize: 13,
  },
  unscheduledDay: {
    color: "var(--border-strong)",
    background: "var(--bg-unscheduled)",
  },
  completedDay: {
    color: "var(--color-accent)",
    background: "var(--accent-wash)",
    border: "1px solid var(--accent-border)",
    fontWeight: 600,
  },
  completedDayMark: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 8,
    height: 8,
    color: "var(--color-accent)",
  },
  today: {
    outline: "1px solid rgba(var(--accent-rgb), 0.5)",
    outlineOffset: -1,
  },
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    color: "var(--text-muted)",
    textAlign: "center",
    padding: "44px 20px",
  },
  emptyIcon: {
    color: "var(--text-dim)",
  },
  emptyTitle: {
    color: "var(--text-secondary)",
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
    color: "var(--text-primary)",
    margin: "0 0 12px",
  },
  focusSessionsList: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-2)",
  },
  focusSessionsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
    gap: "var(--space-3)",
  },
  focusSessionItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "var(--space-3)",
    padding: "var(--space-3) 0",
    borderBottom: "1px solid var(--border-color)",
    background: "transparent",
  },
  focusSessionItemGrid: {
    ...CARD_SURFACE,
    borderBottom: "none",
  },
  focusSessionInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-1)",
    flex: 1,
    minWidth: 0,
  },
  focusSessionType: {
    fontSize: "var(--type-sm)",
    fontWeight: "var(--font-medium)",
    color: "var(--text-body)",
  },
  focusSessionMeta: {
    fontSize: "var(--type-xs)",
    color: "var(--text-secondary)",
  },
  focusSessionHabit: {
    fontSize: "var(--type-xs)",
    color: "var(--text-secondary)",
  },
  focusSessionDuration: {
    fontSize: "var(--type-sm)",
    fontWeight: "var(--font-semibold)",
    color: "var(--color-accent)",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  deleteFocusSessionButton: {
    background: "transparent",
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--radius-md)",
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-dim)",
    cursor: "pointer",
    padding: 0,
    transition: "color var(--transition-standard), border-color var(--transition-standard)",
    flexShrink: 0,
  },
  noFocusSessions: {
    fontSize: 13,
    color: "var(--text-dim)",
    textAlign: "center",
    padding: "20px 0",
  },
};



function History({
  habits,
  focusSessions,
  viewMode,
  onRequestDeleteFocusSession,
  streakFreeze,
  dayResetHour,
  weekStart,
}: HistoryProps) {
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
    const firstWeekday = (new Date(year, month, 1).getDay() - (weekStart === "Monday" ? 1 : 0) + 7) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: firstWeekday + daysInMonth }, (_, index) => {
      if (index < firstWeekday) return null;
      return new Date(year, month, index - firstWeekday + 1);
    });
  }, [displayedMonth, weekStart]);

  const weekdayLabels = Array.from({ length: 7 }, (_, index) =>
    WEEKDAYS[((weekStart === "Monday" ? 1 : 0) + index) % 7],
  );
  const todayKey = getHabitDateKey(new Date(), dayResetHour);

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
  const sortedFocusSessions = useMemo(() => {
    return [...focusSessions].sort((a, b) => b.timestamp - a.timestamp);
  }, [focusSessions]);
  const completedHabitDays = habits.reduce((total, habit) => total + habit.completedDates.length, 0);
  const activeStreakCount = habits.filter(
    (habit) => calculateStreak(habit, streakFreeze, dayResetHour) > 0,
  ).length;
  const sortedCompletionDates = habits.flatMap((habit) => habit.completedDates).sort();
  const logDateRange = sortedCompletionDates.length > 0
    ? `${formatFullDate(new Date(`${sortedCompletionDates[0]}T12:00:00`))} - ${formatFullDate(new Date(`${sortedCompletionDates[sortedCompletionDates.length - 1]}T12:00:00`))}`
    : "No logs yet";

  function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    const time = date.toLocaleTimeString(undefined, {
      minute: "2-digit",
      hour: "2-digit",
    });
    return `${formatFullDate(date)} · ${time}`;
  }

  function moveMonth(delta: number) {
    setDisplayedMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + delta, 1),
    );
  }

  function jumpToToday() {
    const [year, month, day] = todayKey.split("-").map(Number);
    const today = new Date(year, month - 1, day);
    setDisplayedMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>History</h1>
      <p style={styles.subtitle}>Review your completed habit days.</p>

      <div style={styles.summaryBar}>
        {selectedHabit ? (
          <>
            <div style={styles.summaryCard}>
              <span style={styles.summaryLabel}>Current Streak</span>
              <strong className="ui-numeric" style={styles.summaryValue}>{calculateStreak(selectedHabit, streakFreeze, dayResetHour)}</strong>
            </div>
            <div style={styles.summaryCard}>
              <span style={styles.summaryLabel}>Total Completed Days</span>
              <strong className="ui-numeric" style={styles.summaryValue}>{selectedHabit.completedDates.length}</strong>
            </div>
            <div style={styles.summaryCard}>
              <span style={styles.summaryLabel}>Completion Count</span>
              <strong className="ui-numeric" style={styles.summaryValue}>{monthCompletionCount}</strong>
            </div>
          </>
        ) : (
          <>
            <div style={styles.summaryCard}>
              <span style={styles.summaryLabel}>Habit Completions</span>
              <strong className="ui-numeric" style={styles.summaryValue}>{completedHabitDays}</strong>
            </div>
            <div style={styles.summaryCard}>
              <span style={styles.summaryLabel}>Active Streaks</span>
              <strong className="ui-numeric" style={styles.summaryValue}>{activeStreakCount}</strong>
            </div>
            <div style={styles.summaryCard}>
              <span style={styles.summaryLabel}>Log Date Range</span>
              <strong style={{ ...styles.summaryValue, fontSize: "var(--type-sm)" }}>{logDateRange}</strong>
            </div>
          </>
        )}
      </div>

      <div style={styles.selectWrapper}>
        <select
          style={styles.select}
          value={effectiveSelectedHabitId}
          onChange={(event) =>
            setSelectedHabitId(
              event.target.value === "" ? "" : Number(event.target.value),
            )
          }
          aria-label="Select a Habit to view history"
        >
          <option value="">Select a Habit</option>
          {habits.map((habit) => (
            <option key={habit.id} value={habit.id}>
              {habit.name}
            </option>
          ))}
        </select>
      </div>

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
            {weekdayLabels.map((day) => (
              <span key={day} style={styles.weekday}>
                {day}
              </span>
            ))}
            {calendarDays.map((date, index) => {
              const dateKey = date ? getDateKey(date) : `empty-${index}`;
              const isScheduled = date
                ? isHabitScheduledOnDate(selectedHabit, dateKey)
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
                  aria-label={date
                    ? `${formatFullDate(date)}: ${!isScheduled ? "not scheduled" : isCompleted ? "completed" : "scheduled, not completed"}`
                    : undefined}
                  title={date
                    ? `${formatFullDate(date)}: ${!isScheduled ? "not scheduled" : isCompleted ? "completed" : "scheduled, not completed"}`
                    : undefined}
                >
                  {date?.getDate() ?? ""}
                  {isCompleted && <Check aria-hidden="true" style={styles.completedDayMark} />}
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
          <div style={{ ...styles.focusSessionsList, ...(viewMode === "grid" ? styles.focusSessionsGrid : {}) }}>
            {sortedFocusSessions.map((session) => (
              <div
                key={session.id}
                style={{
                  ...styles.focusSessionItem,
                  ...(viewMode === "grid" ? styles.focusSessionItemGrid : {}),
                }}
              >
                <div style={styles.focusSessionInfo}>
                  <span style={styles.focusSessionType}>{session.sessionType}</span>
                  <span style={styles.focusSessionMeta}>{formatTimestamp(session.timestamp)}</span>
                  <span style={styles.focusSessionHabit}>{session.habitName}</span>
                </div>
                <span className="ui-numeric" style={styles.focusSessionDuration}>{session.durationMinutes}m</span>
                <button
                  style={styles.deleteFocusSessionButton}
                  onClick={() => onRequestDeleteFocusSession(session.id)}
                  aria-label={`Delete focus session ${formatTimestamp(session.timestamp)}`}
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