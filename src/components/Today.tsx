import { useMemo, type CSSProperties } from "react";
import { Check, Flame, ListChecks, Play, Plus } from "lucide-react";
import { CARD_SURFACE } from "../theme";

type Habit = {
  id: number;
  name: string;
  priority: "Mandatory" | "Optional";
  type: "Daily" | "Challenge";
  frequencyType?: "daily" | "weekdays" | "weekends" | "custom";
  customDays?: string[];
  durationDays?: number;
  startDate?: string;
  completedDates: string[];
  category?: string;
  isArchived?: boolean;
};

type FocusSessionRecord = {
  id: number;
  timestamp: number;
  sessionType: "Timer" | "Pomodoro Focus";
  durationMinutes: number;
  habitName: string;
};

type TodayProps = {
  habits: Habit[];
  focusSessions: FocusSessionRecord[];
  onToggleHabit: (id: number, dateKey?: string) => void;
  onStartFocus: () => void;
  onNavigateToHabits: () => void;
  streakFreeze: boolean;
  dayResetHour: number;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: 860,
    width: "100%",
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: "var(--text-primary)",
    margin: "0 0 8px",
  },
  date: {
    fontSize: 15,
    color: "var(--text-secondary)",
    margin: "0 0 16px",
  },
  progressSection: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginBottom: 32,
  },
  progressText: {
    fontSize: 14,
    color: "var(--text-body)",
    fontWeight: 500,
  },
  progressBar: {
    flex: 1,
    height: 8,
    background: "var(--bg-inset)",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "linear-gradient(90deg, var(--accent-teal-soft), var(--accent-teal))",
    transition: "width 0.3s ease",
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: "var(--text-primary)",
    margin: "0 0 16px",
  },
  habitList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  habitCard: {
    ...CARD_SURFACE,
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: 16,
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
    fontSize: 11,
    fontWeight: 500,
    borderRadius: 12,
    padding: "2px 8px",
    whiteSpace: "nowrap",
  },
  priorityMandatory: {
    color: "var(--accent-teal)",
    background: "rgba(var(--accent-rgb), 0.08)",
    border: "1px solid rgba(var(--accent-rgb), 0.3)",
  },
  priorityOptional: {
    color: "var(--text-muted)",
    background: "transparent",
    border: "1px solid var(--border-strong)",
  },
  categoryBadge: {
    fontSize: 11,
    fontWeight: 500,
    color: "var(--text-secondary)",
    background: "var(--bg-inset)",
    border: "1px solid var(--border-strong)",
    borderRadius: 4,
    padding: "2px 6px",
    whiteSpace: "nowrap",
  },
  streakBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    color: "var(--accent-teal)",
    background: "rgba(var(--accent-rgb), 0.08)",
    border: "1px solid rgba(var(--accent-rgb), 0.3)",
    borderRadius: 12,
    padding: "2px 8px",
    whiteSpace: "nowrap",
  },
  streakZero: {
    color: "var(--text-dim)",
    background: "transparent",
    border: "1px solid var(--border-strong)",
  },
  habitCardCompleted: {
    ...CARD_SURFACE,
    background: "var(--bg-completed)",
    opacity: 0.8,
  },
  habitNameCompleted: {
    color: "var(--text-dim)",
    textDecoration: "line-through",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    border: "2px solid var(--border-strong)",
    background: "transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transition: "all 0.15s ease",
  },
  checkboxChecked: {
    background: "rgba(var(--accent-rgb), 0.1)",
    borderColor: "rgba(var(--accent-rgb), 0.42)",
  },
  checkboxHover: {
    borderColor: "rgba(var(--accent-rgb), 0.42)",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
    marginBottom: 32,
  },
  statCard: {
    ...CARD_SURFACE,
    padding: 16,
  },
  statLabel: {
    display: "block",
    fontSize: 12,
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  statValue: {
    display: "block",
    fontSize: 24,
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  statValueAccent: {
    color: "var(--accent-teal)",
  },
  emptyState: {
    ...CARD_SURFACE,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: "48px 24px",
    textAlign: "center",
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
  emptyButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    background: "rgba(var(--accent-rgb), 0.1)",
    border: "1px solid rgba(var(--accent-rgb), 0.42)",
    borderRadius: 8,
    padding: "10px 16px",
    fontSize: 14,
    fontWeight: 500,
    color: "var(--accent-teal)",
    cursor: "pointer",
    marginTop: 8,
  },
  focusButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    background: "rgba(var(--accent-rgb), 0.1)",
    border: "1px solid rgba(var(--accent-rgb), 0.42)",
    borderRadius: 8,
    padding: "10px 16px",
    fontSize: 14,
    fontWeight: 500,
    color: "var(--accent-teal)",
    cursor: "pointer",
  },
  quickActionList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    width: "fit-content",
    maxWidth: "100%",
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

function getTodayKey(resetHour = 0): string {
  return getHabitDateKey(new Date(), resetHour);
}

function isHabitScheduledOnDate(
  habit: Pick<Habit, "frequencyType" | "customDays">,
  dateKey: string,
): boolean {
  const frequencyType = habit.frequencyType ?? "daily";
  if (frequencyType === "daily") return true;

  const [year, month, day] = dateKey.split("-").map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  if (frequencyType === "weekdays") return weekday >= 1 && weekday <= 5;
  if (frequencyType === "weekends") return weekday === 0 || weekday === 6;
  return habit.customDays?.includes(WEEKDAYS[weekday]) ?? false;
}

function isChallengeActiveOnDate(habit: Habit, dateKey: string): boolean {
  if (habit.type !== "Challenge" || !habit.startDate || !habit.durationDays) {
    return false;
  }
  const daysElapsed = diffInDays(dateKey, habit.startDate);
  return daysElapsed >= 0 && daysElapsed < habit.durationDays;
}

function diffInDays(aKey: string, bKey: string): number {
  const [ay, am, ad] = aKey.split("-").map(Number);
  const [by, bm, bd] = bKey.split("-").map(Number);
  const a = new Date(ay, am - 1, ad).getTime();
  const b = new Date(by, bm - 1, bd).getTime();
  return Math.round((a - b) / 86400000);
}

function calculateStreak(habit: Habit, streakFreeze = false, dayResetHour = 0): number {
  const dateSet = new Set(habit.completedDates);
  const todayKey = getTodayKey(dayResetHour);

  if (habit.frequencyType === "custom" && (habit.customDays?.length ?? 0) === 0) {
    return 0;
  }

  if (streakFreeze) {
    return [...dateSet].filter(
      (date) => date <= todayKey && isHabitScheduledOnDate(habit, date),
    ).length;
  }

  let cursor = dateSet.has(todayKey) ? todayKey : shiftDateKey(todayKey, -1);
  let streak = 0;

  while (true) {
    if (!isHabitScheduledOnDate(habit, cursor)) {
      cursor = shiftDateKey(cursor, -1);
      continue;
    }
    if (!dateSet.has(cursor)) break;
    streak++;
    cursor = shiftDateKey(cursor, -1);
  }

  return streak;
}

function shiftDateKey(key: string, deltaDays: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + deltaDays);
  return getDateKey(date);
}

function Today({
  habits,
  focusSessions,
  onToggleHabit,
  onStartFocus,
  onNavigateToHabits,
  streakFreeze,
  dayResetHour,
}: TodayProps) {
  const todayKey = getTodayKey(dayResetHour);
  const today = useMemo(() => new Date(), []);
  
  const todayHabits = useMemo(() => {
    return habits.filter(
      (habit) =>
        !habit.isArchived &&
        (habit.type === "Daily" || isChallengeActiveOnDate(habit, todayKey)) &&
        isHabitScheduledOnDate(habit, todayKey),
    );
  }, [habits, todayKey]);

  const completedCount = todayHabits.filter((habit) =>
    habit.completedDates.includes(todayKey),
  ).length;
  const totalCount = todayHabits.length;
  const progressPercent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  const todayFocusTime = useMemo(() => {
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    
    return focusSessions
      .filter((session) => session.timestamp >= todayStart.getTime() && session.timestamp <= todayEnd.getTime())
      .reduce((total, session) => total + session.durationMinutes, 0);
  }, [focusSessions, today]);

  const bestStreak = useMemo(() => {
    return Math.max(0, ...todayHabits.map((habit) => calculateStreak(habit, streakFreeze, dayResetHour)));
  }, [todayHabits, streakFreeze, dayResetHour]);

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  };

  if (todayHabits.length === 0) {
    return (
      <div style={styles.page}>
        <div style={styles.header}>
          <h1 style={styles.title}>Today</h1>
          <p style={styles.date}>{formatDate(today)}</p>
        </div>
        
        <div style={styles.emptyState}>
          <p style={styles.emptyTitle}>No habits scheduled for today</p>
          <p style={styles.emptyText}>
            {habits.length === 0
              ? "Create your first habit to get started."
              : "Enjoy your free day or check back tomorrow."}
          </p>
          {habits.length === 0 && (
            <button style={styles.emptyButton} onClick={onNavigateToHabits}>
              <Plus size={16} />
              Create Habit
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Today</h1>
        <p style={styles.date}>{formatDate(today)}</p>
        
        <div style={styles.progressSection}>
          <span style={styles.progressText}>
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

      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>Habits Completed</span>
          <span style={styles.statValue}>{completedCount}</span>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>Highest Streak</span>
          <span style={{ ...styles.statValue, ...styles.statValueAccent }}>{bestStreak}</span>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>Today's Focus Time</span>
          <span style={styles.statValue}>{todayFocusTime}m</span>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>Remaining Habits</span>
          <span style={styles.statValue}>{totalCount - completedCount}</span>
        </div>
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Today's Habits</h2>
        <div style={styles.habitList}>
          {todayHabits.map((habit) => {
            const isCompleted = habit.completedDates.includes(todayKey);
            const streak = calculateStreak(habit, streakFreeze, dayResetHour);
            
            return (
              <div
                key={habit.id}
                style={{
                  ...styles.habitCard,
                  ...(isCompleted ? styles.habitCardCompleted : {}),
                }}
              >
                <button
                  style={{
                    ...styles.checkbox,
                    ...(isCompleted ? styles.checkboxChecked : {}),
                  }}
                  onClick={() => onToggleHabit(habit.id, todayKey)}
                  aria-label={`Toggle ${habit.name}`}
                  aria-checked={isCompleted}
                >
                  {isCompleted && <Check size={14} color="var(--accent-teal)" />}
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
                    {habit.category && (
                      <span style={styles.categoryBadge}>{habit.category}</span>
                    )}
                    <span
                      style={{
                        ...styles.streakBadge,
                        ...(streak === 0 ? styles.streakZero : {}),
                      }}
                    >
                      <Flame size={12} />
                      {streak}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Quick Actions</h2>
        <div style={styles.quickActionList}>
          <button style={styles.focusButton} onClick={onNavigateToHabits}>
            <ListChecks size={16} />
            Configure Habits
          </button>
          <button style={styles.focusButton} onClick={onStartFocus}>
            <Play size={16} />
            Start Focus Session
          </button>
        </div>
      </div>
    </div>
  );
}

export default Today;
