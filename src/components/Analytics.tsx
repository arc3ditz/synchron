import { useMemo, useState, type CSSProperties } from "react";
import {
  Clock,
  Flame,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Lightbulb,
  Zap,
} from "lucide-react";

import { CARD_SURFACE, FORM_CONTROL } from "../theme";
import type { Habit, Task, TimeHorizon, FocusSessionRecord } from "../types";
import {
  WEEKDAYS,
} from "../utils/dates";
import {
  queryAnalyticsData,
  getHabitPerformanceDiagnostics,
  getHabitPeriodStreak,
  getFocusHeatmapData,
  getHabitFocusMinutes,
  getTimeOfDayInsights,
  getWeekdayFrictionMetrics,
  generateActionableInsights,
  TOP_PERFORMING_THRESHOLD,
  NEEDS_ATTENTION_THRESHOLD,
  type ActionableInsight,
} from "../domain/analytics";

type AnalyticsProps = {
  habits: Habit[];
  tasks: Task[];
  focusSessions: FocusSessionRecord[];
  streakFreeze: boolean;
  dayResetHour: number;
  weekStart: "Sunday" | "Monday";
};

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: "100%",
    width: "100%",
    boxSizing: "border-box",
    padding: "0 clamp(16px, 2vw, 32px)",
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
    border: "1px solid transparent",
    borderRadius: 20,
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text-secondary)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  filterButtonActive: {
    background: "var(--accent-wash-soft)",
    color: "var(--color-accent)",
    borderColor: "transparent",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
    gap: 16,
    marginBottom: 24,
  },
  panel: {
    ...CARD_SURFACE,
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
  },
  frictionPanel: {
    gridColumn: "1 / -1",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: "var(--text-body)",
    margin: "0 0 16px",
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    minWidth: 0,
    overflowWrap: "anywhere",
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
    flex: 1,
    width: "100%",
    minWidth: 0,
    height: 8,
    background: "var(--border-color)",
    borderRadius: 4,
    overflow: "hidden",
    marginTop: 8,
  },
  progressFill: {
    height: "100%",
    maxWidth: "100%",
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
    minWidth: 0,
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
    minWidth: 0,
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
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  habitMeta: {
    fontSize: 12,
    color: "var(--text-secondary)",
  },
  habitStats: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexShrink: 0,
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
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    gap: 4,
    marginTop: 16,
    width: "100%",
    minWidth: 0,
  },
  heatmapCell: {
    aspectRatio: 1,
    minWidth: 0,
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
    ...FORM_CONTROL,
    width: 80,
  },
  empty: {
    fontSize: 13,
    color: "var(--text-dim)",
    textAlign: "center",
    padding: "32px 20px",
  },
  // Decision Support Banner styles
  insightsSection: {
    marginBottom: 24,
    width: "100%",
    containerType: "inline-size",
    containerName: "analytics-insights",
  },
  insightsTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: "var(--text-primary)",
    margin: "0 0 12px",
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  insightsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
    gap: 12,
    minWidth: 0,
  },
  insightCard: {
    ...CARD_SURFACE,
    minWidth: 0,
    boxSizing: "border-box",
    padding: 16,
    borderRadius: 12,
    borderLeft: "3px solid",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  insightCardPositive: {
    borderColor: "var(--color-success-border)",
    background: "var(--color-success-wash)",
  },
  insightCardWarning: {
    borderColor: "var(--color-warning-border)",
    background: "var(--color-warning-wash)",
  },
  insightCardActionable: {
    borderColor: "var(--accent-border-soft)",
    background: "var(--accent-wash-soft)",
  },
  insightHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
    margin: 0,
    flex: 1,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  insightDescription: {
    fontSize: 13,
    color: "var(--text-secondary)",
    margin: 0,
    lineHeight: 1.4,
    flex: 1,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  // Performance widget styles
  performanceSection: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minWidth: 0,
  },
  performanceItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 0",
    borderBottom: "1px solid var(--border-color)",
    minWidth: 0,
  },
  performanceItemLast: {
    borderBottom: "none",
  },
  performanceName: {
    fontSize: 14,
    color: "var(--text-body)",
    flex: 1,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  performanceRate: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--accent-teal)",
  },
  // Time bucket styles
  timeBucketBar: {
    display: "flex",
    height: 32,
    borderRadius: 6,
    overflow: "hidden",
    marginTop: 12,
    width: "100%",
    minWidth: 0,
  },
  timeBucketSegment: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 500,
    color: "var(--text-primary)",
    transition: "flex 0.3s ease",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  timeBucketLabel: {
    width: "100%",
    textAlign: "center",
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.1,
  },
  timeBucketLegend: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    columnGap: 16,
    rowGap: 10,
    marginTop: 16,
    marginBottom: 4,
    padding: "0 4px",
    boxSizing: "border-box",
    width: "100%",
    minWidth: 0,
  },
  timeBucketLegendItem: {
    display: "grid",
    gridTemplateColumns: "8px minmax(0, 1fr)",
    gridTemplateRows: "auto auto",
    alignItems: "center",
    columnGap: 6,
    rowGap: 2,
    fontSize: 12,
    color: "var(--text-secondary)",
    minWidth: 0,
  },
  timeBucketLegendItemPeak: {
    color: "var(--accent-teal)",
  },
  timeBucketLegendName: {
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1.2,
  },
  timeBucketLegendStats: {
    fontSize: 11,
    lineHeight: 1.2,
    color: "var(--text-secondary)",
    gridColumn: 2,
  },
  timeBucketDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
  },
  // Friction day styles
  frictionDayBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 14px",
    borderRadius: 20,
    fontSize: 13,
    fontWeight: 500,
    background: "var(--color-warning-wash)",
    color: "var(--color-warning)",
    border: "1px solid var(--color-warning-border)",
  },
};

function formatHours(minutes: number): string {
  const hours = minutes / 60;
  if (hours < 1) {
    return `${Math.round(minutes)}m`;
  }
  return `${hours.toFixed(1)}h`;
}

function formatSessionCount(count: number): string {
  return `${count} ${count === 1 ? "session" : "sessions"}`;
}

function Analytics({
  habits,
  tasks,
  focusSessions,
  streakFreeze,
  dayResetHour,
  weekStart,
}: AnalyticsProps) {
  const [timeHorizon, setTimeHorizon] = useState<TimeHorizon>("This Week");

  const dataset = useMemo(() => queryAnalyticsData({
      habits,
      tasks,
      focusSessions,
      horizon: timeHorizon,
      weekStart,
      dayResetHour,
      streakFreeze,
    }), [habits, tasks, focusSessions, timeHorizon, weekStart, dayResetHour, streakFreeze]);

  const actionableInsights = useMemo(
    () => generateActionableInsights(dataset),
    [dataset],
  );

  const habitPerformance = useMemo(() => {
    return getHabitPerformanceDiagnostics(dataset);
  }, [dataset]);

  const timeOfDayInsights = useMemo(() => {
    return getTimeOfDayInsights(dataset.focusSessions);
  }, [dataset]);

  const timeBucketFlexTotal =
    timeOfDayInsights.morningMinutes +
    timeOfDayInsights.afternoonMinutes +
    timeOfDayInsights.eveningMinutes +
    timeOfDayInsights.nightMinutes;
  const timeBuckets = [
    { name: "Morning", minutes: timeOfDayInsights.morningMinutes, sessions: timeOfDayInsights.morningSessions },
    { name: "Afternoon", minutes: timeOfDayInsights.afternoonMinutes, sessions: timeOfDayInsights.afternoonSessions },
    { name: "Evening", minutes: timeOfDayInsights.eveningMinutes, sessions: timeOfDayInsights.eveningSessions },
    { name: "Night", minutes: timeOfDayInsights.nightMinutes, sessions: timeOfDayInsights.nightSessions },
  ] as const;

  const weekdayFriction = useMemo(() => {
    return getWeekdayFrictionMetrics(dataset);
  }, [dataset]);

  const habitStats = useMemo(() => {
    const habitMinutes = getHabitFocusMinutes(dataset);
    const habitCompletions = new Map<number, number>();

    for (const occurrence of dataset.habitOccurrences) {
      if (occurrence.completed) {
        habitCompletions.set(occurrence.habit.id, (habitCompletions.get(occurrence.habit.id) ?? 0) + 1);
      }
    }

    return dataset.habits
      .map((habit) => ({
        ...habit,
        totalMinutes: habitMinutes.get(habit.id) ?? 0,
        completionCount: habitCompletions.get(habit.id) ?? 0,
        streak: getHabitPeriodStreak(dataset, habit, streakFreeze),
      }))
      .filter((habit) => habit.totalMinutes > 0)
      .sort((a, b) => b.totalMinutes - a.totalMinutes)
      .slice(0, 5);
  }, [dataset, streakFreeze]);

  const heatmapData = useMemo(
    () => getFocusHeatmapData(dataset, weekStart, dayResetHour),
    [dataset, weekStart, dayResetHour],
  );

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

      {/* Decision Support Banner */}
      {actionableInsights.length > 0 && (
        <div style={styles.insightsSection}>
          <h2 style={styles.insightsTitle}>
            <Lightbulb size={18} />
            Actionable Insights & Recommendations
          </h2>
          <div className="analytics-insights-grid" style={styles.insightsGrid}>
            {actionableInsights.map((insight) => {
              const getInsightStyle = (type: ActionableInsight["type"]) => {
                switch (type) {
                  case "positive":
                    return styles.insightCardPositive;
                  case "warning":
                    return styles.insightCardWarning;
                  case "actionable":
                    return styles.insightCardActionable;
                }
              };

              const getInsightIcon = (type: ActionableInsight["type"]) => {
                switch (type) {
                  case "positive":
                    return <CheckCircle size={16} color="var(--color-success)" />;
                  case "warning":
                    return <AlertTriangle size={16} color="var(--color-warning)" />;
                  case "actionable":
                    return <Zap size={16} color="var(--color-accent)" />;
                }
              };

              return (
                <div
                  key={insight.id}
                  style={{
                    ...styles.insightCard,
                    ...getInsightStyle(insight.type),
                  }}
                  className="analytics-insight-card"
                >
                  <div style={styles.insightHeader}>
                    {getInsightIcon(insight.type)}
                    <h3 style={styles.insightTitle}>{insight.title}</h3>
                  </div>
                  <p style={styles.insightDescription}>{insight.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={styles.grid}>
        {/* Habit Performance Widget */}
        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>
            <Flame size={18} />
            Habit Performance
          </h3>
          <div style={styles.performanceSection}>
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
                Top Performing ({TOP_PERFORMING_THRESHOLD}% & Above)
              </span>
              {habitPerformance.strongestHabits.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 8 }}>
                  {habitPerformance.hasData ? `No habits at ${TOP_PERFORMING_THRESHOLD}% completion or above in this period.` : "No reliable data for this period."}
                </p>
              ) : (
                habitPerformance.strongestHabits.slice(0, 3).map((habit, index) => (
                  <div
                    key={habit.habit.id}
                    style={{
                      ...styles.performanceItem,
                      ...(index === Math.min(habitPerformance.strongestHabits.length - 1, 2) ? styles.performanceItemLast : {}),
                    }}
                  >
                    <span style={styles.performanceName}>{habit.habit.name}</span>
                    <span style={styles.performanceRate}>{Math.round(habit.completionRate)}%</span>
                  </div>
                ))
              )}
            </div>
            <div>
              <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
                Needs Attention (Under {NEEDS_ATTENTION_THRESHOLD}%)
              </span>
              {habitPerformance.weakestHabits.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 8 }}>
                  {habitPerformance.hasData ? `No habits under ${NEEDS_ATTENTION_THRESHOLD}% in this period.` : "No reliable data for this period."}
                </p>
              ) : (
                habitPerformance.weakestHabits.slice(0, 3).map((habit, index) => (
                  <div
                    key={habit.habit.id}
                    style={{
                      ...styles.performanceItem,
                      ...(index === Math.min(habitPerformance.weakestHabits.length - 1, 2) ? styles.performanceItemLast : {}),
                    }}
                  >
                    <span style={styles.performanceName}>{habit.habit.name}</span>
                    <span style={{ ...styles.performanceRate, color: "var(--color-warning)" }}>
                      {Math.round(habit.completionRate)}%
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-color)" }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Overall Completion Rate</span>
            {habitPerformance.overallCompletionRate === null ? (
              <p style={styles.empty}>No reliable data for this period.</p>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>
                  {habitPerformance.overallCompletionRate}%
                </span>
                <div style={{ flex: 1, ...styles.progressBar }}>
                  <div style={{ ...styles.progressFill, width: `${habitPerformance.overallCompletionRate}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Peak Focus Window Widget */}
        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>
            <Clock size={18} />
            Most Focused Time
          </h3>
          {!timeOfDayInsights.peakFocusWindow ? (
            <p style={styles.empty}>No reliable data for this period.</p>
          ) : (
            <>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
                You logged the most focus minutes during <strong style={{ color: "var(--text-primary)" }}>{timeOfDayInsights.peakFocusWindow}</strong> hours.
              </p>
              <div style={styles.timeBucketBar}>
                {timeBuckets.map((bucket) => (
                  <div
                    key={bucket.name}
                    style={{
                      ...styles.timeBucketSegment,
                      flex: bucket.minutes,
                      background: timeOfDayInsights.peakFocusWindow === bucket.name
                        ? "rgba(var(--accent-rgb), 0.3)"
                        : "rgba(var(--accent-rgb), 0.1)",
                    }}
                  >
                    {bucket.minutes / timeBucketFlexTotal > 0.15 && (
                      <span style={styles.timeBucketLabel}>{formatHours(bucket.minutes)}</span>
                    )}
                  </div>
                ))}
              </div>
              <div style={styles.timeBucketLegend}>
                {timeBuckets.map((bucket) => {
                  const isPeak = timeOfDayInsights.peakFocusWindow === bucket.name;
                  return (
                    <div
                      key={bucket.name}
                      style={{
                        ...styles.timeBucketLegendItem,
                        ...(isPeak ? styles.timeBucketLegendItemPeak : {}),
                      }}
                    >
                      <div
                        style={{
                          ...styles.timeBucketDot,
                          background: isPeak ? "rgba(var(--accent-rgb), 0.6)" : "rgba(var(--accent-rgb), 0.3)",
                          gridRow: "1 / span 2",
                        }}
                      />
                      <span style={styles.timeBucketLegendName}>{bucket.name}</span>
                      <span style={{
                        ...styles.timeBucketLegendStats,
                        ...(isPeak ? { color: "var(--accent-teal)", fontWeight: 600 } : {}),
                      }}>
                        {formatSessionCount(bucket.sessions)} / {formatHours(bucket.minutes)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Friction Days Widget */}
        <div style={{ ...styles.panel, ...styles.frictionPanel }}>
          <h3 style={styles.panelTitle}>
            <AlertTriangle size={18} />
            Friction Days
          </h3>
          {weekdayFriction.highestFrictionDay ? (
            <div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
                Highest concentration of incomplete items.
              </p>
              <div style={styles.frictionDayBadge}>
                <AlertTriangle size={14} />
                {weekdayFriction.highestFrictionDay}
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-secondary)" }}>
                {(() => {
                  const dayMap: Record<string, { frictionRate: number }> = {
                    monday: weekdayFriction.monday,
                    tuesday: weekdayFriction.tuesday,
                    wednesday: weekdayFriction.wednesday,
                    thursday: weekdayFriction.thursday,
                    friday: weekdayFriction.friday,
                    saturday: weekdayFriction.saturday,
                    sunday: weekdayFriction.sunday,
                  };
                  return `${dayMap[weekdayFriction.highestFrictionDay.toLowerCase()].frictionRate.toFixed(0)}% Friction Rate`;
                })()}
              </div>
            </div>
          ) : (
            <p style={styles.empty}>No reliable data for this period.</p>
          )}
        </div>
      </div>

      <div style={styles.grid}>
        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>
            <Flame size={18} />
            Top Habits
          </h3>
          {habitStats.length === 0 ? (
            <p style={styles.empty}>No reliable data for this period.</p>
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
                      {habit.completionCount} Period Completions
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
        {!heatmapData.hasData ? (
          <p style={styles.empty}>No reliable data for this period.</p>
        ) : (
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
                  title={`${cell.dateKey}: ${formatHours(cell.minutes)}`}
                >
                  {cell.day}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default Analytics;