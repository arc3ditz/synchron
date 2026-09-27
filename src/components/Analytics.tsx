import { useMemo, useState, type CSSProperties } from "react";
import {
  Target,
  TrendingUp,
  Clock,
  Flame,
  Calendar,
} from "lucide-react";
import type { FocusSessionRecord } from "./History";

import { CARD_SURFACE } from "../theme";

type Habit = {
  id: number;
  name: string;
  completedDates: string[];
  frequencyType?: "daily" | "weekdays" | "weekends" | "custom";
  customDays?: string[];
  isArchived?: boolean;
};

type AnalyticsProps = {
  habits: Habit[];
  focusSessions: FocusSessionRecord[];
  streakFreeze: boolean;
  dayResetHour: number;
  weekStart: "Sunday" | "Monday";
};

type TimeHorizon = "This Week" | "This Month" | "Last 30 Days" | "All Time";

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: 1200,
    width: "100%",
  },
  title: {
    fontSize: 24,
    fontWeight: 600,
    color: "var(--text-primary)",
    margin: "0 0 4px",
  },
  subtitle: {
    fontSize: 14,
    color: "var(--text-secondary)",
    margin: "0 0 24px",
  },
  filterBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 24,
    flexWrap: "wrap",
  },
  filterButton: {
    background: "transparent",
    border: "1px solid var(--border-strong)",
    borderRadius: 20,
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text-secondary)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  filterButtonActive: {
    background: "rgba(var(--accent-rgb), 0.1)",
    color: "var(--accent-teal)",
    borderColor: "rgba(var(--accent-rgb), 0.42)",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 16,
    marginBottom: 24,
  },
  panel: {
    ...CARD_SURFACE,
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: "var(--text-body)",
    margin: "0 0 16px",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 600,
    color: "var(--text-primary)",
    margin: "0 0 4px",
  },
  statLabel: {
    fontSize: 13,
    color: "var(--text-secondary)",
    margin: 0,
  },
  statSub: {
    fontSize: 12,
    color: "var(--text-secondary)",
    marginTop: 4,
  },
  progressBar: {
    height: 8,
    background: "var(--border-color)",
    borderRadius: 4,
    overflow: "hidden",
    marginTop: 8,
  },
  progressFill: {
    height: "100%",
    background: "var(--accent-teal)",
    borderRadius: 4,
    transition: "width 0.3s ease",
  },
  ratioBar: {
    height: 24,
    background: "var(--border-color)",
    borderRadius: 4,
    overflow: "hidden",
    display: "flex",
    marginTop: 12,
  },
  ratioSegment: {
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 500,
    color: "var(--text-primary)",
  },
  habitItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 0",
    borderBottom: "1px solid var(--border-color)",
  },
  habitItemLast: {
    borderBottom: "none",
  },
  habitArchived: {
    opacity: 0.6,
  },
  habitInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    flex: 1,
    minWidth: 0,
  },
  habitName: {
    fontSize: 14,
    fontWeight: 500,
    color: "var(--text-body)",
  },
  habitMeta: {
    fontSize: 12,
    color: "var(--text-secondary)",
  },
  habitStats: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  habitHours: {
    fontSize: 16,
    fontWeight: 600,
    color: "var(--accent-teal)",
  },
  habitStreak: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    color: "var(--accent-teal)",
  },
  heatmapGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: 4,
    marginTop: 16,
  },
  heatmapCell: {
    aspectRatio: 1,
    borderRadius: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 10,
    color: "var(--text-dim)",
  },
  heatmapDay: {
    fontSize: 11,
    color: "var(--text-muted)",
    textAlign: "center",
    paddingBottom: 4,
  },
  goalSection: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  goalInput: {
    background: "var(--bg-inset)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    padding: "8px 12px",
    color: "var(--text-primary)",
    fontSize: 14,
    width: 80,
    outline: "none",
  },
  empty: {
    fontSize: 13,
    color: "var(--text-dim)",
    textAlign: "center",
    padding: "32px 20px",
  },
};

function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getHabitDateKey(date: Date, resetHour: number): string {
  const habitDate = new Date(date);
  if (habitDate.getHours() < resetHour) {
    habitDate.setDate(habitDate.getDate() - 1);
  }
  return getDateKey(habitDate);
}

function getWeekStart(date: Date, weekStart: "Sunday" | "Monday"): Date {
  const d = new Date(date);
  const firstDay = weekStart === "Monday" ? 1 : 0;
  const daysSinceStart = (d.getDay() - firstDay + 7) % 7;
  d.setDate(d.getDate() - daysSinceStart);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getDaysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function formatHours(minutes: number): string {
  const hours = minutes / 60;
  if (hours < 1) {
    return `${Math.round(minutes)}m`;
  }
  return `${hours.toFixed(1)}h`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isScheduledOnDate(habit: Habit, dateKey: string): boolean {
  const frequencyType = habit.frequencyType ?? "daily";
  if (frequencyType === "daily") return true;

  const [year, month, day] = dateKey.split("-").map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  if (frequencyType === "weekdays") return weekday >= 1 && weekday <= 5;
  if (frequencyType === "weekends") return weekday === 0 || weekday === 6;
  return habit.customDays?.includes(WEEKDAYS[weekday]) ?? false;
}

function calculateStreak(habit: Habit, streakFreeze: boolean, dayResetHour: number): number {
  const dateSet = new Set(habit.completedDates);
  const todayKey = getHabitDateKey(new Date(), dayResetHour);

  if (habit.frequencyType === "custom" && (habit.customDays?.length ?? 0) === 0) {
    return 0;
  }

  const shiftDate = (key: string, deltaDays: number): string => {
    const [year, month, day] = key.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + deltaDays);
    return getDateKey(date);
  };

  if (streakFreeze) {
    return [...dateSet].filter(
      (date) => date <= todayKey && isScheduledOnDate(habit, date),
    ).length;
  }

  let cursor = dateSet.has(todayKey) ? todayKey : shiftDate(todayKey, -1);
  let streak = 0;
  while (true) {
    if (!isScheduledOnDate(habit, cursor)) {
      cursor = shiftDate(cursor, -1);
      continue;
    }
    if (!dateSet.has(cursor)) break;
    streak++;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

function Analytics({
  habits,
  focusSessions,
  streakFreeze,
  dayResetHour,
  weekStart,
}: AnalyticsProps) {
  const [timeHorizon, setTimeHorizon] = useState<TimeHorizon>("This Week");
  const [weeklyGoalHours, setWeeklyGoalHours] = useState(20);

  const filteredSessions = useMemo(() => {
    const now = new Date();
    let startDate: Date;

    switch (timeHorizon) {
      case "This Week":
        startDate = getWeekStart(now, weekStart);
        break;
      case "This Month":
        startDate = getMonthStart(now);
        break;
      case "Last 30 Days":
        startDate = getDaysAgo(30);
        break;
      case "All Time":
        return focusSessions;
    }

    return focusSessions.filter((session) => {
      const sessionDate = new Date(session.timestamp);
      return sessionDate >= startDate && sessionDate <= now;
    });
  }, [focusSessions, timeHorizon, weekStart]);

  const totalFocusMinutes = useMemo(() => {
    return filteredSessions.reduce((sum, session) => sum + session.durationMinutes, 0);
  }, [filteredSessions]);

  const currentWeekSessions = useMemo(() => {
    const now = new Date();
    const weekStartDate = getWeekStart(now, weekStart);
    return focusSessions.filter((session) => {
      const sessionDate = new Date(session.timestamp);
      return sessionDate >= weekStartDate && sessionDate <= now;
    });
  }, [focusSessions, weekStart]);

  const currentWeekMinutes = useMemo(() => {
    return currentWeekSessions.reduce((sum, session) => sum + session.durationMinutes, 0);
  }, [currentWeekSessions]);

  const currentMonthSessions = useMemo(() => {
    const now = new Date();
    const monthStart = getMonthStart(now);
    return focusSessions.filter((session) => {
      const sessionDate = new Date(session.timestamp);
      return sessionDate >= monthStart && sessionDate <= now;
    });
  }, [focusSessions]);

  const currentMonthMinutes = useMemo(() => {
    return currentMonthSessions.reduce((sum, session) => sum + session.durationMinutes, 0);
  }, [currentMonthSessions]);

  const habitStats = useMemo(() => {
    const habitMinutes: Record<number, number> = {};
    
    filteredSessions.forEach((session) => {
      const habit = habits.find((h) => h.name === session.habitName);
      if (habit) {
        habitMinutes[habit.id] = (habitMinutes[habit.id] || 0) + session.durationMinutes;
      }
    });

    return habits
      .map((habit) => ({
        ...habit,
        totalMinutes: habitMinutes[habit.id] || 0,
        streak: calculateStreak(habit, streakFreeze, dayResetHour),
      }))
      .filter((habit) => habit.totalMinutes > 0)
      .sort((a, b) => b.totalMinutes - a.totalMinutes)
      .slice(0, 5);
  }, [filteredSessions, habits, streakFreeze, dayResetHour]);

  const weeklyProgress = useMemo(() => {
    const goalMinutes = weeklyGoalHours * 60;
    return Math.min(100, (currentWeekMinutes / goalMinutes) * 100);
  }, [currentWeekMinutes, weeklyGoalHours]);

  const peakFocusWindow = useMemo(() => {
    const hourCounts: Record<number, number> = {};
    
    focusSessions.forEach((session) => {
      const hour = new Date(session.timestamp).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + session.durationMinutes;
    });

    let maxMinutes = 0;
    let peakHour = 9; // Default to 9 AM

    Object.entries(hourCounts).forEach(([hour, minutes]) => {
      if (minutes > maxMinutes) {
        maxMinutes = minutes;
        peakHour = parseInt(hour);
      }
    });

    const startHour = peakHour;
    const endHour = (peakHour + 2) % 24;
    
    const formatHour = (h: number) => {
      const period = h >= 12 ? "PM" : "AM";
      const displayHour = h % 12 || 12;
      return `${displayHour} ${period}`;
    };

    return `${formatHour(startHour)} - ${formatHour(endHour)}`;
  }, [focusSessions]);

  const heatmapData = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = (new Date(year, month, 1).getDay() - (weekStart === "Monday" ? 1 : 0) + 7) % 7;

    const dailyMinutes: Record<string, number> = {};
    
    focusSessions.forEach((session) => {
      const dateKey = getDateKey(new Date(session.timestamp));
      dailyMinutes[dateKey] = (dailyMinutes[dateKey] || 0) + session.durationMinutes;
    });

    const maxMinutes = Math.max(...Object.values(dailyMinutes), 1);

    const cells = [];
    for (let i = 0; i < firstDay; i++) {
      cells.push({ type: "empty" as const });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = getDateKey(new Date(year, month, day));
      const minutes = dailyMinutes[dateKey] || 0;
      const intensity = minutes > 0 ? Math.min(4, Math.ceil((minutes / maxMinutes) * 4)) : 0;
      cells.push({ type: "day" as const, day, minutes, intensity });
    }

    return { cells, year, month };
  }, [focusSessions, weekStart]);

  const weekdayLabels = Array.from({ length: 7 }, (_, index) =>
    WEEKDAYS[((weekStart === "Monday" ? 1 : 0) + index) % 7],
  );

  function getHeatmapColor(intensity: number): string {
    const colors = [
      "var(--bg-inset)",
      "rgba(var(--accent-rgb), 0.16)",
      "rgba(var(--accent-rgb), 0.34)",
      "rgba(var(--accent-rgb), 0.6)",
      "rgba(var(--accent-rgb), 0.9)",
    ];
    return colors[intensity];
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Analytics</h1>
      <p style={styles.subtitle}>Track your focus patterns and habit consistency.</p>

      <div style={styles.filterBar}>
        {(["This Week", "This Month", "Last 30 Days", "All Time"] as TimeHorizon[]).map((horizon) => (
          <button
            key={horizon}
            style={{
              ...styles.filterButton,
              ...(timeHorizon === horizon ? styles.filterButtonActive : {}),
            }}
            onClick={() => setTimeHorizon(horizon)}
          >
            {horizon}
          </button>
        ))}
      </div>

      <div style={styles.grid}>
        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>
            <Target size={18} />
            Weekly Focus Goal
          </h3>
          <div style={styles.goalSection}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 13, color: "var(--text-muted)" }}>Target:</label>
              <input
                type="number"
                min={1}
                max={168}
                value={weeklyGoalHours}
                onChange={(e) => setWeeklyGoalHours(Math.max(1, parseInt(e.target.value) || 1))}
                style={styles.goalInput}
              />
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Hours/Week</span>
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: "var(--text-body)" }}>
                  {formatHours(currentWeekMinutes)} / {weeklyGoalHours}h
                </span>
                <span style={{ fontSize: 13, color: "var(--accent-teal)" }}>
                  {weeklyProgress.toFixed(0)}%
                </span>
              </div>
              <div style={styles.progressBar}>
                <div className="progress-fill" style={{ ...styles.progressFill, width: `${weeklyProgress}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>
            <Clock size={18} />
            Total Focus Hours
          </h3>
          <p style={styles.statValue}>{formatHours(totalFocusMinutes)}</p>
          <p style={styles.statLabel}>Selected Period</p>
          <p style={styles.statSub}>
            This Month: {formatHours(currentMonthMinutes)} · This Week: {formatHours(currentWeekMinutes)}
          </p>
        </div>

        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>
            <TrendingUp size={18} />
            Peak Focus Window
          </h3>
          <p style={styles.statValue}>{peakFocusWindow}</p>
          <p style={styles.statLabel}>Most Productive Time</p>
          <p style={styles.statSub}>Based on your session history</p>
        </div>
      </div>

      <div style={styles.grid}>
        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>
            <Flame size={18} />
            Top Habits
          </h3>
          {habitStats.length === 0 ? (
            <p style={styles.empty}>No habit data yet</p>
          ) : (
            <div>
              {habitStats.map((habit, index) => (
                <div
                  key={habit.id}
                  style={{
                    ...styles.habitItem,
                    ...(index === habitStats.length - 1 ? styles.habitItemLast : {}),
                    ...(habit.isArchived ? styles.habitArchived : {}),
                  }}
                >
                  <div style={styles.habitInfo}>
                    <span style={styles.habitName}>
                      {habit.name}
                      {habit.isArchived && <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 6 }}>(Archived)</span>}
                    </span>
                    <span style={styles.habitMeta}>
                      {habit.completedDates.length} Completions
                    </span>
                  </div>
                  <div style={styles.habitStats}>
                    <span style={styles.habitHours}>{formatHours(habit.totalMinutes)}</span>
                    {habit.streak > 0 && (
                      <span style={styles.habitStreak}>
                        <Flame size={12} />
                        {habit.streak}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={styles.panel}>
        <h3 style={styles.panelTitle}>
          <Calendar size={18} />
          Focus Intensity Heatmap
        </h3>
        <div style={styles.heatmapGrid}>
          {weekdayLabels.map((day) => (
            <div key={day} style={styles.heatmapDay}>
              {day}
            </div>
          ))}
          {heatmapData.cells.map((cell, index) => {
            if (cell.type === "empty") {
              return <div key={index} style={styles.heatmapCell} />;
            }
            return (
              <div
                key={index}
                style={{
                  ...styles.heatmapCell,
                  background: getHeatmapColor(cell.intensity),
                  color:
                    cell.intensity > 3 ? "var(--bg-primary)" : cell.intensity > 0 ? "var(--text-primary)" : "var(--text-dim)",
                }}
                title={`${cell.day}: ${formatHours(cell.minutes)}`}
              >
                {cell.day}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default Analytics;