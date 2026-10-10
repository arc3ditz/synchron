import { useMemo, useState } from "react";
import {
  Clock,
  Flame,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Lightbulb,
  Zap,
} from "lucide-react";

import type { Habit, Task, TimeHorizon, FocusSessionRecord } from "../types";
import { WEEKDAYS } from "../utils/dates";
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

const HORIZONS: TimeHorizon[] = ["This Week", "This Month", "Last 30 Days", "All Time"];

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

  const dataset = useMemo(
    () =>
      queryAnalyticsData({
        habits,
        tasks,
        focusSessions,
        horizon: timeHorizon,
        weekStart,
        dayResetHour,
        streakFreeze,
      }),
    [habits, tasks, focusSessions, timeHorizon, weekStart, dayResetHour, streakFreeze],
  );

  const actionableInsights = useMemo(() => generateActionableInsights(dataset), [dataset]);

  const habitPerformance = useMemo(() => getHabitPerformanceDiagnostics(dataset), [dataset]);

  const timeOfDayInsights = useMemo(
    () => getTimeOfDayInsights(dataset.focusSessions),
    [dataset],
  );

  const timeBucketFlexTotal =
    timeOfDayInsights.morningMinutes +
    timeOfDayInsights.afternoonMinutes +
    timeOfDayInsights.eveningMinutes +
    timeOfDayInsights.nightMinutes;
  const totalSessions =
    timeOfDayInsights.morningSessions +
    timeOfDayInsights.afternoonSessions +
    timeOfDayInsights.eveningSessions +
    timeOfDayInsights.nightSessions;
  const timeBuckets = [
    { name: "Morning", minutes: timeOfDayInsights.morningMinutes, sessions: timeOfDayInsights.morningSessions },
    { name: "Afternoon", minutes: timeOfDayInsights.afternoonMinutes, sessions: timeOfDayInsights.afternoonSessions },
    { name: "Evening", minutes: timeOfDayInsights.eveningMinutes, sessions: timeOfDayInsights.eveningSessions },
    { name: "Night", minutes: timeOfDayInsights.nightMinutes, sessions: timeOfDayInsights.nightSessions },
  ] as const;

  const weekdayFriction = useMemo(() => getWeekdayFrictionMetrics(dataset), [dataset]);

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

  const weekdayLabels = Array.from(
    { length: 7 },
    (_, index) => WEEKDAYS[((weekStart === "Monday" ? 1 : 0) + index) % 7],
  );

  const frictionEntries: { day: string; rate: number }[] = [
    { day: "Monday", rate: weekdayFriction.monday.frictionRate },
    { day: "Tuesday", rate: weekdayFriction.tuesday.frictionRate },
    { day: "Wednesday", rate: weekdayFriction.wednesday.frictionRate },
    { day: "Thursday", rate: weekdayFriction.thursday.frictionRate },
    { day: "Friday", rate: weekdayFriction.friday.frictionRate },
    { day: "Saturday", rate: weekdayFriction.saturday.frictionRate },
    { day: "Sunday", rate: weekdayFriction.sunday.frictionRate },
  ];
  const maxFriction = Math.max(1, ...frictionEntries.map((entry) => entry.rate));

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

  const statBand = [
    { label: "Focus time", value: formatHours(timeBucketFlexTotal), sub: formatSessionCount(totalSessions) },
    {
      label: "Completion rate",
      value: habitPerformance.overallCompletionRate === null ? "—" : `${habitPerformance.overallCompletionRate}%`,
      sub: `${habitPerformance.strongestHabits.length} top · ${habitPerformance.weakestHabits.length} lagging`,
    },
    { label: "Peak window", value: timeOfDayInsights.peakFocusWindow ?? "—", sub: "Most focused time" },
    { label: "Friction day", value: weekdayFriction.highestFrictionDay ?? "—", sub: "Most incomplete items" },
  ];

  return (
    <div className="atelier-page analytics-view">
      <div className="page-head">
        <p className="atelier-eyebrow">Analytics</p>
        <h1 className="atelier-greeting">Patterns, not pressure.</h1>
        <p>Track your focus patterns and habit consistency.</p>
      </div>

      <div className="category-tabs" role="tablist" aria-label="Time horizon">
        {HORIZONS.map((horizon) => (
          <button
            key={horizon}
            type="button"
            role="tab"
            aria-selected={timeHorizon === horizon}
            className={`category-tab${timeHorizon === horizon ? " active" : ""}`}
            onClick={() => setTimeHorizon(horizon)}
          >
            {horizon}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        {statBand.map((stat) => (
          <div key={stat.label} className="ui-card" style={{ padding: "16px 18px" }}>
            <p className="section-eyebrow" style={{ margin: "0 0 8px" }}>
              {stat.label}
            </p>
            <p
              className="ui-numeric"
              style={{
                margin: 0,
                fontFamily: "var(--font-display)",
                fontSize: "clamp(1.6rem, 3vw, 2.1rem)",
                fontWeight: 500,
                letterSpacing: "-0.02em",
                color: "var(--text-primary)",
                overflowWrap: "anywhere",
              }}
            >
              {stat.value}
            </p>
            <p style={{ margin: "6px 0 0", fontSize: "var(--type-xs)", color: "var(--text-secondary)" }}>
              {stat.sub}
            </p>
          </div>
        ))}
      </div>

      {actionableInsights.length > 0 && (
        <section style={{ marginBottom: 16 }} aria-label="Actionable insights">
          <h2
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              margin: "0 0 12px",
              fontSize: "var(--type-md)",
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            <Lightbulb size={18} />
            Actionable Insights and Recommendations
          </h2>
          <div className="atelier-group">
            {actionableInsights.map((insight) => {
              const badgeClass =
                insight.type === "positive"
                  ? "ui-badge ui-badge--success"
                  : insight.type === "warning"
                    ? "ui-badge ui-badge--warning"
                    : "ui-badge ui-badge--accent";
              const Icon =
                insight.type === "positive" ? CheckCircle : insight.type === "warning" ? AlertTriangle : Zap;
              const iconColor =
                insight.type === "positive"
                  ? "var(--color-success)"
                  : insight.type === "warning"
                    ? "var(--color-warning)"
                    : "var(--color-accent)";
              return (
                <div key={insight.id} className="atelier-group-row" style={{ alignItems: "flex-start" }}>
                  <Icon size={16} color={iconColor} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <h3 style={{ margin: 0, fontSize: "var(--type-sm)", fontWeight: 600, color: "var(--text-primary)" }}>
                        {insight.title}
                      </h3>
                      <span className={badgeClass}>{insight.type satisfies ActionableInsight["type"]}</span>
                    </div>
                    <p style={{ margin: "4px 0 0", fontSize: "var(--type-sm)", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      {insight.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 12, marginBottom: 12 }}>
        <div className="ui-card" style={{ padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "var(--type-base)", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <Flame size={18} />
            Habit Performance
          </h3>
          <p className="section-eyebrow" style={{ margin: "0 0 4px" }}>
            Top Performing ({TOP_PERFORMING_THRESHOLD}% and Above)
          </p>
          {habitPerformance.strongestHabits.length === 0 ? (
            <p style={{ fontSize: "var(--type-sm)", color: "var(--text-dim)", margin: "8px 0 12px" }}>
              {habitPerformance.hasData
                ? `No habits at ${TOP_PERFORMING_THRESHOLD}% completion or above in this period.`
                : "No reliable data for this period."}
            </p>
          ) : (
            <div className="atelier-group" style={{ margin: "8px 0 12px" }}>
              {habitPerformance.strongestHabits.slice(0, 3).map((habit) => (
                <div key={habit.habit.id} className="atelier-group-row">
                  <span className="truncate-1" style={{ flex: 1, minWidth: 0, fontSize: "var(--type-sm)" }}>
                    {habit.habit.name}
                  </span>
                  <div className="progress-track" style={{ flex: "1 1 90px", height: 6, minWidth: 60 }}>
                    <div className="progress-fill" style={{ width: `${Math.round(habit.completionRate)}%`, height: "100%" }} />
                  </div>
                  <span className="ui-numeric" style={{ fontSize: "var(--type-sm)", fontWeight: 600, color: "var(--color-accent)" }}>
                    {Math.round(habit.completionRate)}%
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="section-eyebrow" style={{ margin: "0 0 4px" }}>
            Needs Attention (Under {NEEDS_ATTENTION_THRESHOLD}%)
          </p>
          {habitPerformance.weakestHabits.length === 0 ? (
            <p style={{ fontSize: "var(--type-sm)", color: "var(--text-dim)", margin: "8px 0 0" }}>
              {habitPerformance.hasData
                ? `No habits under ${NEEDS_ATTENTION_THRESHOLD}% in this period.`
                : "No reliable data for this period."}
            </p>
          ) : (
            <div className="atelier-group" style={{ margin: "8px 0 0" }}>
              {habitPerformance.weakestHabits.slice(0, 3).map((habit) => (
                <div key={habit.habit.id} className="atelier-group-row">
                  <span className="truncate-1" style={{ flex: 1, minWidth: 0, fontSize: "var(--type-sm)" }}>
                    {habit.habit.name}
                  </span>
                  <div className="progress-track" style={{ flex: "1 1 90px", height: 6, minWidth: 60 }}>
                    <div
                      className="progress-fill"
                      style={{ width: `${Math.round(habit.completionRate)}%`, height: "100%", background: "var(--color-warning)" }}
                    />
                  </div>
                  <span className="ui-numeric" style={{ fontSize: "var(--type-sm)", fontWeight: 600, color: "var(--color-warning)" }}>
                    {Math.round(habit.completionRate)}%
                  </span>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-color)" }}>
            <span style={{ fontSize: "var(--type-xs)", color: "var(--text-secondary)" }}>Overall Completion Rate</span>
            {habitPerformance.overallCompletionRate === null ? (
              <p style={{ fontSize: "var(--type-sm)", color: "var(--text-dim)", textAlign: "center", padding: "12px 0" }}>
                No reliable data for this period.
              </p>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <span className="ui-numeric" style={{ fontSize: "var(--type-lg)", fontWeight: 600 }}>
                  {habitPerformance.overallCompletionRate}%
                </span>
                <div className="progress-track" style={{ flex: 1, height: 8 }}>
                  <div className="progress-fill" style={{ width: `${habitPerformance.overallCompletionRate}%`, height: "100%" }} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="ui-card" style={{ padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "var(--type-base)", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <Clock size={18} />
            Most Focused Time
          </h3>
          {!timeOfDayInsights.peakFocusWindow ? (
            <p style={{ fontSize: "var(--type-sm)", color: "var(--text-dim)", textAlign: "center", padding: "32px 20px" }}>
              No reliable data for this period.
            </p>
          ) : (
            <>
              <p style={{ fontSize: "var(--type-sm)", color: "var(--text-secondary)", margin: "0 0 12px" }}>
                You logged the most focus minutes during{" "}
                <strong style={{ color: "var(--text-primary)" }}>{timeOfDayInsights.peakFocusWindow}</strong> hours.
              </p>
              <div style={{ display: "flex", height: 32, borderRadius: "var(--radius-md)", overflow: "hidden", marginTop: 12 }}>
                {timeBuckets.map((bucket) => (
                  <div
                    key={bucket.name}
                    style={{
                      flex: Math.max(bucket.minutes, 0.001),
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "var(--type-xs)",
                      fontWeight: 500,
                      background:
                        timeOfDayInsights.peakFocusWindow === bucket.name
                          ? "rgba(var(--accent-rgb), 0.3)"
                          : "rgba(var(--accent-rgb), 0.1)",
                      color: "var(--text-primary)",
                      minWidth: 0,
                      overflow: "hidden",
                    }}
                  >
                    {timeBucketFlexTotal > 0 && bucket.minutes / timeBucketFlexTotal > 0.15 && (
                      <span>{formatHours(bucket.minutes)}</span>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginTop: 16 }}>
                {timeBuckets.map((bucket) => {
                  const isPeak = timeOfDayInsights.peakFocusWindow === bucket.name;
                  return (
                    <div key={bucket.name} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          flexShrink: 0,
                          background: isPeak ? "rgba(var(--accent-rgb), 0.6)" : "rgba(var(--accent-rgb), 0.3)",
                        }}
                      />
                      <span style={{ fontSize: "var(--type-xs)", color: isPeak ? "var(--color-accent)" : "var(--text-secondary)", fontWeight: isPeak ? 600 : 500 }}>
                        {bucket.name} · {formatSessionCount(bucket.sessions)} / {formatHours(bucket.minutes)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="ui-card" style={{ padding: 20, marginBottom: 12 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: "var(--type-base)", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={18} />
          Friction Days
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: "var(--type-sm)", color: "var(--text-secondary)" }}>
          Highest concentration of incomplete items.
        </p>
        {weekdayFriction.highestFrictionDay ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="ui-badge ui-badge--warning" style={{ alignSelf: "flex-start" }}>
              <AlertTriangle size={12} />
              {weekdayFriction.highestFrictionDay}
            </span>
            {frictionEntries.map((entry) => (
              <div key={entry.day} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 84, flexShrink: 0, fontSize: "var(--type-xs)", color: "var(--text-secondary)" }}>
                  {entry.day.slice(0, 3)}
                </span>
                <div className="progress-track" style={{ flex: 1, height: 8 }}>
                  <div
                    className="progress-fill"
                    style={{
                      width: `${Math.round((entry.rate / maxFriction) * 100)}%`,
                      height: "100%",
                      background:
                        entry.day === weekdayFriction.highestFrictionDay
                          ? "var(--color-warning)"
                          : "rgba(var(--accent-rgb), 0.4)",
                    }}
                  />
                </div>
                <span className="ui-numeric" style={{ width: 44, textAlign: "right", fontSize: "var(--type-xs)", color: "var(--text-secondary)" }}>
                  {entry.rate.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: "var(--type-sm)", color: "var(--text-dim)", textAlign: "center", padding: "12px 0" }}>
            No reliable data for this period.
          </p>
        )}
      </div>

      <div className="ui-card" style={{ padding: 20, marginBottom: 12 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: "var(--type-base)", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <Flame size={18} />
          Top Habits
        </h3>
        {habitStats.length === 0 ? (
          <p style={{ fontSize: "var(--type-sm)", color: "var(--text-dim)", textAlign: "center", padding: "32px 20px" }}>
            No reliable data for this period.
          </p>
        ) : (
          <div className="atelier-group">
            {habitStats.map((habit) => (
              <div key={habit.id} className="atelier-group-row" style={{ opacity: habit.isArchived ? 0.6 : 1 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="truncate-1" style={{ margin: 0, fontSize: "var(--type-sm)", fontWeight: 500 }}>
                    {habit.name}
                    {habit.isArchived && (
                      <span style={{ fontSize: "var(--type-xs)", color: "var(--text-muted)", marginLeft: 6 }}>(Archived)</span>
                    )}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: "var(--type-xs)", color: "var(--text-secondary)" }}>
                    {habit.completionCount} Period Completions
                  </p>
                </div>
                <span className="ui-numeric" style={{ fontSize: "var(--type-md)", fontWeight: 600, color: "var(--color-accent)" }}>
                  {formatHours(habit.totalMinutes)}
                </span>
                {habit.streak > 0 && (
                  <span className="ui-badge ui-badge--accent">
                    <Flame size={12} />
                    {habit.streak}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ui-card" style={{ padding: 20 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: "var(--type-base)", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <Calendar size={18} />
          Focus Intensity Heatmap
        </h3>
        {!heatmapData.hasData ? (
          <p style={{ fontSize: "var(--type-sm)", color: "var(--text-dim)", textAlign: "center", padding: "32px 20px" }}>
            No reliable data for this period.
          </p>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4, marginTop: 8 }}>
              {weekdayLabels.map((day) => (
                <div key={day} style={{ fontSize: "var(--type-xs)", color: "var(--text-muted)", textAlign: "center", paddingBottom: 4 }}>
                  {day}
                </div>
              ))}
              {heatmapData.cells.map((cell, index) => {
                if (cell.type === "empty") {
                  return <div key={index} style={{ aspectRatio: "1", borderRadius: "var(--radius-sm)" }} />;
                }
                return (
                  <div
                    key={index}
                    style={{
                      aspectRatio: "1",
                      borderRadius: "var(--radius-sm)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "var(--type-xs)",
                      background: getHeatmapColor(cell.intensity),
                      color:
                        cell.intensity > 3
                          ? "var(--bg-primary)"
                          : cell.intensity > 0
                            ? "var(--text-primary)"
                            : "var(--text-dim)",
                    }}
                    title={`${cell.dateKey}: ${formatHours(cell.minutes)}`}
                  >
                    {cell.day}
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 12 }}>
              <span style={{ fontSize: "var(--type-xs)", color: "var(--text-muted)", marginRight: 4 }}>Less</span>
              {[0, 1, 2, 3, 4].map((level) => (
                <span
                  key={level}
                  style={{ width: 14, height: 14, borderRadius: 4, background: getHeatmapColor(level) }}
                />
              ))}
              <span style={{ fontSize: "var(--type-xs)", color: "var(--text-muted)", marginLeft: 4 }}>More</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Analytics;
