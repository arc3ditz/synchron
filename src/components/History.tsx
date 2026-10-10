import { useMemo, useState, type CSSProperties } from "react";
import { Check, ChevronLeft, ChevronRight, History as HistoryIcon, Trash2 } from "lucide-react";

import type { HistoryHabit, FocusSessionRecord } from "../types";
import { FORM_CONTROL } from "../theme";
import {
  getDateKey,
  getHabitDateKey,
  WEEKDAYS,
  isHabitScheduledOnDate,
  calculateStreak,
  formatFullDate,
} from "../utils/dates";

export type { FocusSessionRecord };

// Selects build on the shared control spec so every dropdown matches inputs.
const selectStyle: CSSProperties = { ...FORM_CONTROL, flex: 1, minWidth: 0 };

type HistoryProps = {
  habits: HistoryHabit[];
  focusSessions: FocusSessionRecord[];
  viewMode: "grid" | "list";
  onRequestDeleteFocusSession: (id: number) => void;
  streakFreeze: boolean;
  dayResetHour: number;
  weekStart: "Sunday" | "Monday";
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

  const weekdayLabels = Array.from(
    { length: 7 },
    (_, index) => WEEKDAYS[((weekStart === "Monday" ? 1 : 0) + index) % 7],
  );
  const todayKey = getHabitDateKey(new Date(), dayResetHour);

  const monthPrefix = `${displayedMonth.getFullYear()}-${String(displayedMonth.getMonth() + 1).padStart(2, "0")}`;
  const monthCompletionCount =
    selectedHabit?.completedDates.filter((date) => date.startsWith(`${monthPrefix}-`)).length ?? 0;
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
  const logDateRange =
    sortedCompletionDates.length > 0
      ? `${formatFullDate(new Date(`${sortedCompletionDates[0]}T12:00:00`))} - ${formatFullDate(new Date(`${sortedCompletionDates[sortedCompletionDates.length - 1]}T12:00:00`))}`
      : "No logs yet";

  const groupedSessions = useMemo(() => {
    const groups = new Map<string, FocusSessionRecord[]>();
    for (const session of sortedFocusSessions) {
      const key = getHabitDateKey(new Date(session.timestamp), dayResetHour);
      const list = groups.get(key) ?? [];
      list.push(session);
      groups.set(key, list);
    }
    return [...groups.entries()];
  }, [sortedFocusSessions, dayResetHour]);

  function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    const time = date.toLocaleTimeString(undefined, {
      minute: "2-digit",
      hour: "2-digit",
    });
    return `${formatFullDate(date)} · ${time}`;
  }

  function moveMonth(delta: number) {
    setDisplayedMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  function jumpToToday() {
    const [year, month, day] = todayKey.split("-").map(Number);
    const today = new Date(year, month - 1, day);
    setDisplayedMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  }

  const summaryStats = selectedHabit
    ? [
        { label: "Current Streak", value: String(calculateStreak(selectedHabit, streakFreeze, dayResetHour)) },
        { label: "Total Completed Days", value: String(selectedHabit.completedDates.length) },
        { label: "This Month", value: String(monthCompletionCount) },
      ]
    : [
        { label: "Habit Completions", value: String(completedHabitDays) },
        { label: "Active Streaks", value: String(activeStreakCount) },
        { label: "Log Date Range", value: logDateRange },
      ];

  return (
    <div className="atelier-page">
      <div className="page-head">
        <p className="atelier-eyebrow">History</p>
        <h1 className="atelier-greeting">Every day on record.</h1>
        <p>Review your completed habit days.</p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        {summaryStats.map((stat) => (
          <div key={stat.label} className="ui-card" style={{ padding: "14px 16px" }}>
            <p className="section-eyebrow" style={{ margin: "0 0 6px" }}>
              {stat.label}
            </p>
            <p
              className="ui-numeric"
              style={{
                margin: 0,
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 500,
                letterSpacing: "-0.01em",
                color: "var(--text-primary)",
                overflowWrap: "anywhere",
              }}
            >
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="page-toolbar">
        <select
          className="ui-select"
          style={{ ...selectStyle, flex: 1, minWidth: 0 }}
          value={effectiveSelectedHabitId}
          onChange={(event) =>
            setSelectedHabitId(event.target.value === "" ? "" : Number(event.target.value))
          }
          aria-label="Select a Habit to View History"
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
        <div className="ui-empty-state">
          <HistoryIcon size={22} style={{ color: "var(--text-dim)" }} />
          <p style={{ margin: 0, fontWeight: 500 }}>{selectedHabit ? "No completed days yet" : "Choose a Habit to Begin"}</p>
          <p className="atelier-sub" style={{ margin: 0 }}>
            {selectedHabit
              ? "Completed days will appear here once you mark this habit done."
              : "Select a habit to view its completion history."}
          </p>
        </div>
      ) : (
        <div className="ui-card" style={{ padding: 20 }}>
          <div
            className="date-navigator"
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}
          >
            <button
              type="button"
              className="ui-button ui-button--sm"
              onClick={() => moveMonth(-1)}
              aria-label="Previous Month"
              style={{ minWidth: 32, padding: "6px 8px" }}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: "var(--type-sm)", fontWeight: 600 }}>{monthLabel}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                className="ui-button ui-button--sm"
                onClick={() => moveMonth(1)}
                aria-label="Next Month"
                style={{ minWidth: 32, padding: "6px 8px" }}
              >
                <ChevronRight size={16} />
              </button>
              <button type="button" className="ui-button ui-button--sm" onClick={jumpToToday} aria-label="Jump to Today">
                Today
              </button>
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6 }}>
            {weekdayLabels.map((day) => (
              <span
                key={day}
                style={{ color: "var(--text-secondary)", fontSize: "var(--type-xs)", fontWeight: 600, textAlign: "center", paddingBottom: 4 }}
              >
                {day}
              </span>
            ))}
            {calendarDays.map((date, index) => {
              const dateKey = date ? getDateKey(date) : `empty-${index}`;
              const isScheduled = date ? isHabitScheduledOnDate(selectedHabit, dateKey) : false;
              const isCompleted = isScheduled && completedDateSet.has(dateKey);
              const isToday = isScheduled && dateKey === todayKey;
              return (
                <span
                  key={dateKey}
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    aspectRatio: "1",
                    minWidth: 0,
                    borderRadius: "var(--radius-md)",
                    fontSize: "var(--type-sm)",
                    color: isCompleted ? "var(--color-accent)" : !date || !isScheduled ? "var(--border-strong)" : "var(--text-secondary)",
                    background: isCompleted ? "var(--accent-wash)" : !date || !isScheduled ? "var(--bg-unscheduled)" : "transparent",
                    border: isCompleted ? "1px solid var(--accent-border)" : "1px solid transparent",
                    fontWeight: isCompleted ? 600 : 400,
                    outline: isToday ? "1px solid var(--accent-border)" : "none",
                    outlineOffset: -1,
                  }}
                  aria-label={
                    date
                      ? `${formatFullDate(date)}: ${!isScheduled ? "not scheduled" : isCompleted ? "completed" : "scheduled, not completed"}`
                      : undefined
                  }
                  title={
                    date
                      ? `${formatFullDate(date)}: ${!isScheduled ? "not scheduled" : isCompleted ? "completed" : "scheduled, not completed"}`
                      : undefined
                  }
                >
                  {date?.getDate() ?? ""}
                  {isCompleted && <Check aria-hidden="true" size={8} style={{ position: "absolute", right: 2, bottom: 2 }} />}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <section style={{ marginTop: 24 }} aria-label="Focus sessions">
        <h3 className="ui-section-header" style={{ fontSize: "var(--type-md)" }}>
          Focus Sessions
          <span className="ui-badge">{sortedFocusSessions.length}</span>
        </h3>
        {sortedFocusSessions.length === 0 ? (
          <p style={{ fontSize: "var(--type-sm)", color: "var(--text-dim)", textAlign: "center", padding: "20px 0" }}>
            No focus sessions recorded yet. Complete a timer or pomodoro focus session to see it here.
          </p>
        ) : viewMode === "grid" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 12 }}>
            {sortedFocusSessions.map((session) => (
              <div key={session.id} className="ui-card" style={{ padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: "var(--type-sm)", fontWeight: 600 }}>{session.sessionType}</span>
                  <span className="ui-numeric" style={{ fontSize: "var(--type-sm)", fontWeight: 700, color: "var(--color-accent)" }}>
                    {session.durationMinutes}m
                  </span>
                </div>
                <p style={{ margin: "6px 0 0", fontSize: "var(--type-xs)", color: "var(--text-secondary)" }}>
                  {formatTimestamp(session.timestamp)}
                </p>
                <p className="truncate-1" style={{ margin: "2px 0 10px", fontSize: "var(--type-xs)", color: "var(--text-secondary)" }}>
                  {session.habitName}
                </p>
                <button
                  type="button"
                  className="ui-button ui-button--sm ui-button--ghost"
                  onClick={() => onRequestDeleteFocusSession(session.id)}
                  aria-label={`Delete focus session ${formatTimestamp(session.timestamp)}`}
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="atelier-group">
            {groupedSessions.map(([dateKey, sessions]) => (
              <div key={dateKey}>
                <p className="section-eyebrow" style={{ margin: 0, padding: "12px 16px 4px" }}>
                  {formatFullDate(new Date(`${dateKey}T12:00:00`))}
                </p>
                {sessions.map((session) => (
                  <div key={session.id} className="atelier-group-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="truncate-1" style={{ margin: 0, fontSize: "var(--type-sm)", fontWeight: 600 }}>
                        {session.sessionType}
                      </p>
                      <p style={{ margin: "2px 0 0", fontSize: "var(--type-xs)", color: "var(--text-secondary)" }}>
                        {formatTimestamp(session.timestamp)} · {session.habitName}
                      </p>
                    </div>
                    <span className="ui-numeric" style={{ fontSize: "var(--type-sm)", fontWeight: 700, color: "var(--color-accent)", whiteSpace: "nowrap" }}>
                      {session.durationMinutes}m
                    </span>
                    <button
                      type="button"
                      className="ui-button ui-button--sm ui-button--ghost"
                      style={{ minWidth: 32, padding: "6px 8px" }}
                      onClick={() => onRequestDeleteFocusSession(session.id)}
                      aria-label={`Delete focus session ${formatTimestamp(session.timestamp)}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default History;
