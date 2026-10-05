import type { Habit, Task, Goal, FocusSessionRecord, TimeHorizon, WeekStart } from "../types";
import {
  getDateKey,
  getHabitDateKey,
  getMonthStart,
  getWeekStart,
  isHabitScheduledOnDate,
  shiftDateKey,
} from "../utils/dates.ts";

// Time bucket types
type TimeBucket = "Morning" | "Afternoon" | "Evening" | "Night";
type Weekday = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";

export interface AnalyticsDateRange {
  horizon: TimeHorizon;
  startDateKey: string;
  endDateKey: string;
}

export interface HabitOccurrence {
  habit: Habit;
  dateKey: string;
  completed: boolean;
}

export interface TaskOccurrence {
  task: Task;
  dateKey: string;
}

export interface AnalyticsDataset {
  range: AnalyticsDateRange;
  habits: Habit[];
  focusSessions: FocusSessionRecord[];
  taskOccurrences: TaskOccurrence[];
  habitOccurrences: HabitOccurrence[];
}

export interface AnalyticsQueryParams {
  habits: Habit[];
  tasks: Task[];
  focusSessions: FocusSessionRecord[];
  horizon: TimeHorizon;
  weekStart: WeekStart;
  dayResetHour: number;
  now?: Date;
}

export function queryAnalyticsData({
  habits,
  tasks,
  focusSessions,
  horizon,
  weekStart,
  dayResetHour,
  now = new Date(),
}: AnalyticsQueryParams): AnalyticsDataset {
  const endDateKey = getHabitDateKey(now, dayResetHour);
  const today = parseAnalyticsDateKey(endDateKey);
  let startDateKey: string;

  switch (horizon) {
    case "This Week":
      startDateKey = getDateKey(getWeekStart(today, weekStart));
      break;
    case "This Month":
      startDateKey = getDateKey(getMonthStart(today));
      break;
    case "Last 30 Days":
      startDateKey = shiftDateKey(endDateKey, -29);
      break;
    case "All Time": {
      const historicalDates = [
        ...habits.filter((habit) => !habit.isArchived).flatMap((habit) => {
          const start = getHabitStartDate(habit, dayResetHour);
          const completions = (habit.completedDates ?? [])
            .map(readLocalDateKey)
            .filter(isDateKey)
            .filter((dateKey) => dateKey <= endDateKey && (!start || dateKey >= start));
          return [start, ...completions]
            .filter(isDateKey);
        }),
        ...tasks.map((task) => readLocalDateKey(task.dueDate)).filter(isDateKey),
        ...focusSessions
          .filter(isValidFocusSession)
          .map((session) => getHabitDateKey(new Date(session.timestamp), dayResetHour)),
      ].filter(isDateKey).filter((dateKey) => dateKey <= endDateKey);
      startDateKey = historicalDates.sort()[0] ?? endDateKey;
      break;
    }
  }

  const range = { horizon, startDateKey, endDateKey };
  const inRange = (dateKey: string) => dateKey >= startDateKey && dateKey <= endDateKey;
  const activeHabits = habits.filter((habit) => !habit.isArchived);

  const habitOccurrences: HabitOccurrence[] = [];
  for (const habit of activeHabits) {
    const habitStart = getHabitStartDate(habit, dayResetHour);
    if (!habitStart || habitStart > endDateKey) continue;

    const firstDate = habitStart > startDateKey ? habitStart : startDateKey;
    const lastDate = endDateKey;
    if (firstDate > lastDate) continue;

    const completedDates = new Set((habit.completedDates ?? []).map(readLocalDateKey).filter(isDateKey));
    for (let dateKey = firstDate; dateKey <= lastDate; dateKey = shiftDateKey(dateKey, 1)) {
      if (isHabitScheduledOnDate(habit, dateKey)) {
        habitOccurrences.push({ habit, dateKey, completed: completedDates.has(dateKey) });
      }
    }
  }

  const taskOccurrences = tasks.flatMap((task) => {
    const dateKey = readLocalDateKey(task.dueDate);
    return isDateKey(dateKey) && inRange(dateKey) ? [{ task, dateKey }] : [];
  });

  const filteredSessions = focusSessions.filter((session) => {
    if (!isValidFocusSession(session)) return false;
    const dateKey = getHabitDateKey(new Date(session.timestamp), dayResetHour);
    return inRange(dateKey);
  });

  return { range, habits: activeHabits, focusSessions: filteredSessions, taskOccurrences, habitOccurrences };
}

function getHabitStartDate(habit: Habit, dayResetHour: number): string | undefined {
  const createdDate = readLocalDateKey(habit.createdAt);
  if (isDateKey(createdDate)) return createdDate;

  const firstCompletion = (habit.completedDates ?? [])
    .map(readLocalDateKey)
    .filter(isDateKey)
    .sort()[0];
  const hasTimestampId = Number.isSafeInteger(habit.id) && habit.id >= 1_000_000_000_000;
  if (hasTimestampId) {
    const idDate = new Date(habit.id);
    if (Number.isFinite(idDate.getTime())) {
      const inferredCreatedDate = getHabitDateKey(idDate, dayResetHour);
      if (isDateKey(inferredCreatedDate) && (!firstCompletion || firstCompletion >= inferredCreatedDate)) {
        return inferredCreatedDate;
      }
    }
  }
  return firstCompletion;
}

function isValidFocusSession(session: FocusSessionRecord): boolean {
  return Number.isFinite(session.timestamp) &&
    Number.isFinite(new Date(session.timestamp).getTime()) &&
    Number.isFinite(session.durationMinutes) &&
    session.durationMinutes > 0;
}

function readLocalDateKey(value?: string): string | undefined {
  const match = typeof value === "string" ? /^(\d{4}-\d{2}-\d{2})/.exec(value) : null;
  return match?.[1];
}

function isDateKey(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  return getDateKey(new Date(year, month - 1, day)) === value;
}

function parseAnalyticsDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export interface HabitPerformanceDiagnostics {
  habitRates: HabitPerformanceRate[];
  strongestHabits: HabitPerformanceRate[];
  weakestHabits: HabitPerformanceRate[];
  overallCompletionRate: number | null;
  hasData: boolean;
}

export interface HabitPerformanceRate {
  habit: Habit;
  expectedOccurrences: number;
  completedOccurrences: number;
  completionRate: number;
}

export const TOP_PERFORMING_THRESHOLD = 85;
export const NEEDS_ATTENTION_THRESHOLD = 60;

export interface TimeOfDayInsights {
  morningMinutes: number;
  afternoonMinutes: number;
  eveningMinutes: number;
  nightMinutes: number;
  morningSessions: number;
  afternoonSessions: number;
  eveningSessions: number;
  nightSessions: number;
  peakFocusWindow: TimeBucket | null;
}

interface WeekdayMetric {
  completed: number;
  missed: number;
  frictionRate: number;
  total: number;
}

export interface WeekdayFrictionMetrics {
  monday: WeekdayMetric;
  tuesday: WeekdayMetric;
  wednesday: WeekdayMetric;
  thursday: WeekdayMetric;
  friday: WeekdayMetric;
  saturday: WeekdayMetric;
  sunday: WeekdayMetric;
  highestFrictionDay: Weekday | null;
  hasData: boolean;
}

export interface GoalFocusAllocation {
  allocations: Array<{
    goalId: string;
    goalTitle: string;
    minutes: number;
    percentage: number;
  }>;
  unlinkedMinutes: number;
  unlinkedPercentage: number;
}

export type FocusHeatmapCell =
  | { type: "empty" }
  | { type: "day"; day: number; dateKey: string; minutes: number; intensity: number };

export interface FocusHeatmapData {
  cells: FocusHeatmapCell[];
  hasData: boolean;
}

export interface ActionableInsight {
  id: string;
  type: "positive" | "warning" | "actionable";
  title: string;
  description: string;
}

export function getHabitPerformanceDiagnostics(dataset: AnalyticsDataset): HabitPerformanceDiagnostics {
  const counts = new Map<number, { habit: Habit; expected: number; completed: number }>();
  for (const occurrence of dataset.habitOccurrences) {
    const current = counts.get(occurrence.habit.id) ?? { habit: occurrence.habit, expected: 0, completed: 0 };
    current.expected++;
    if (occurrence.completed) current.completed++;
    counts.set(occurrence.habit.id, current);
  }

  const habitRates = [...counts.values()].map(({ habit, expected, completed }) => ({
    habit,
    expectedOccurrences: expected,
    completedOccurrences: completed,
    completionRate: (completed / expected) * 100,
  }));
  const byCompletionRate = (direction: "ascending" | "descending") => (a: HabitPerformanceRate, b: HabitPerformanceRate) => {
    const rateDifference = direction === "ascending"
      ? a.completionRate - b.completionRate
      : b.completionRate - a.completionRate;
    return rateDifference || a.habit.id - b.habit.id;
  };
  const totalExpected = habitRates.reduce((sum, item) => sum + item.expectedOccurrences, 0);
  const totalCompleted = habitRates.reduce((sum, item) => sum + item.completedOccurrences, 0);

  return {
    habitRates,
    strongestHabits: habitRates
      .filter((item) => item.completionRate >= TOP_PERFORMING_THRESHOLD)
      .sort(byCompletionRate("descending")),
    weakestHabits: habitRates
      .filter((item) => item.completionRate < NEEDS_ATTENTION_THRESHOLD)
      .sort(byCompletionRate("ascending")),
    overallCompletionRate: totalExpected > 0 ? Math.round((totalCompleted / totalExpected) * 100) : null,
    hasData: totalExpected > 0,
  };
}

export function getTimeOfDayInsights(focusSessions: FocusSessionRecord[]): TimeOfDayInsights {
  const totals: Record<TimeBucket, { minutes: number; sessions: number }> = {
    Morning: { minutes: 0, sessions: 0 },
    Afternoon: { minutes: 0, sessions: 0 },
    Evening: { minutes: 0, sessions: 0 },
    Night: { minutes: 0, sessions: 0 },
  };

  for (const session of focusSessions) {
    const bucket = getTimeBucket(new Date(session.timestamp).getHours());
    totals[bucket].minutes += session.durationMinutes;
    totals[bucket].sessions++;
  }

  const peak = (Object.entries(totals) as Array<[TimeBucket, { minutes: number; sessions: number }]>)
    .filter(([, total]) => total.sessions > 0)
    .reduce<[TimeBucket, { minutes: number; sessions: number }] | null>(
      (current, item) => !current || item[1].minutes > current[1].minutes ? item : current,
      null,
    );

  return {
    morningMinutes: totals.Morning.minutes,
    afternoonMinutes: totals.Afternoon.minutes,
    eveningMinutes: totals.Evening.minutes,
    nightMinutes: totals.Night.minutes,
    morningSessions: totals.Morning.sessions,
    afternoonSessions: totals.Afternoon.sessions,
    eveningSessions: totals.Evening.sessions,
    nightSessions: totals.Night.sessions,
    peakFocusWindow: peak?.[0] ?? null,
  };
}

export function getWeekdayFrictionMetrics(dataset: AnalyticsDataset): WeekdayFrictionMetrics {
  const weekdays: Weekday[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const metrics = Object.fromEntries(weekdays.map((day) => [day, {
    completed: 0,
    missed: 0,
    frictionRate: 0,
    total: 0,
  }])) as Record<Weekday, WeekdayMetric>;

  for (const occurrence of dataset.habitOccurrences) {
    const metric = metrics[getWeekday(occurrence.dateKey)];
    if (occurrence.completed) metric.completed++;
    else metric.missed++;
  }
  for (const { task, dateKey } of dataset.taskOccurrences) {
    const metric = metrics[getWeekday(dateKey)];
    if (task.completed) metric.completed++;
    else metric.missed++;
  }

  let highestFrictionDay: Weekday | null = null;
  for (const day of weekdays) {
    const metric = metrics[day];
    metric.total = metric.completed + metric.missed;
    metric.frictionRate = metric.total > 0 ? (metric.missed / metric.total) * 100 : 0;
    if (metric.total > 0 && (!highestFrictionDay || metric.frictionRate > metrics[highestFrictionDay].frictionRate)) {
      highestFrictionDay = day;
    }
  }

  return {
    monday: metrics.Monday,
    tuesday: metrics.Tuesday,
    wednesday: metrics.Wednesday,
    thursday: metrics.Thursday,
    friday: metrics.Friday,
    saturday: metrics.Saturday,
    sunday: metrics.Sunday,
    highestFrictionDay,
    hasData: weekdays.some((day) => metrics[day].total > 0),
  };
}

export function getHabitPeriodStreak(
  dataset: AnalyticsDataset,
  habit: Habit,
): number {
  const occurrences = dataset.habitOccurrences.filter((item) => item.habit.id === habit.id);
  const byDate = new Map(occurrences.map((item) => [item.dateKey, item.completed]));
  let cursor = dataset.range.endDateKey;
  if (byDate.has(cursor) && !byDate.get(cursor)) cursor = shiftDateKey(cursor, -1);

  let streak = 0;
  while (cursor >= dataset.range.startDateKey) {
    if (byDate.has(cursor)) {
      if (!byDate.get(cursor)) break;
      streak++;
    }
    cursor = shiftDateKey(cursor, -1);
  }
  return streak;
}

export function getFocusHeatmapData(
  dataset: AnalyticsDataset,
  weekStart: WeekStart,
  dayResetHour: number,
): FocusHeatmapData {
  const dailyMinutes: Record<string, number> = {};
  for (const session of dataset.focusSessions) {
    const dateKey = getHabitDateKey(new Date(session.timestamp), dayResetHour);
    dailyMinutes[dateKey] = (dailyMinutes[dateKey] ?? 0) + session.durationMinutes;
  }

  const maxMinutes = Object.values(dailyMinutes).reduce((max, minutes) => Math.max(max, minutes), 0);
  const [year, month, day] = dataset.range.startDateKey.split("-").map(Number);
  const firstDay = (new Date(year, month - 1, day).getDay() - (weekStart === "Monday" ? 1 : 0) + 7) % 7;
  const cells: FocusHeatmapCell[] = Array.from({ length: firstDay }, () => ({ type: "empty" }));

  for (
    let dateKey = dataset.range.startDateKey;
    dateKey <= dataset.range.endDateKey;
    dateKey = shiftDateKey(dateKey, 1)
  ) {
    const minutes = dailyMinutes[dateKey] ?? 0;
    const intensity = minutes > 0 && maxMinutes > 0 ? Math.min(4, Math.ceil((minutes / maxMinutes) * 4)) : 0;
    cells.push({ type: "day", day: Number(dateKey.slice(-2)), dateKey, minutes, intensity });
  }

  return { cells, hasData: dataset.focusSessions.length > 0 };
}

export function getHabitFocusMinutes(dataset: AnalyticsDataset): Map<number, number> {
  const totals = new Map<number, number>();
  for (const session of dataset.focusSessions) {
    let habit: Habit | undefined;
    if (session.habitId !== undefined) {
      habit = dataset.habits.find((item) => item.id === session.habitId);
    } else {
      const matches = dataset.habits.filter((item) => item.name === session.habitName);
      if (matches.length === 1) habit = matches[0];
    }
    if (habit) {
      totals.set(habit.id, (totals.get(habit.id) ?? 0) + session.durationMinutes);
    }
  }
  return totals;
}

/**
 * Aggregates focus time allocated to each goal vs unlinked time.
 * @param focusSessions - Array of focus session records
 * @param goals - Array of goals
 * @returns Focus allocation per goal with percentages
 */
export function getGoalFocusAllocation(
  focusSessions: FocusSessionRecord[],
  goals: Goal[],
): GoalFocusAllocation {
  if (!focusSessions || focusSessions.length === 0) {
    return {
      allocations: [],
      unlinkedMinutes: 0,
      unlinkedPercentage: 0,
    };
  }

  const goalMap = new Map<string, { title: string; minutes: number }>();
  let unlinkedMinutes = 0;

  for (const session of focusSessions) {
    const duration = session.durationMinutes;

    // Direct goal link
    if (session.goalId) {
      const goal = goals.find((g) => g.id === session.goalId);
      if (goal) {
        const existing = goalMap.get(session.goalId);
        if (existing) {
          existing.minutes += duration;
        } else {
          goalMap.set(session.goalId, { title: goal.title, minutes: duration });
        }
        continue;
      }
    }

    // Unlinked session
    unlinkedMinutes += duration;
  }

  const totalMinutes = focusSessions.reduce((sum, s) => sum + s.durationMinutes, 0);

  const allocations = Array.from(goalMap.entries()).map(([goalId, data]) => ({
    goalId,
    goalTitle: data.title,
    minutes: data.minutes,
    percentage: totalMinutes > 0 ? (data.minutes / totalMinutes) * 100 : 0,
  }));

  // Sort by percentage descending
  allocations.sort((a, b) => b.percentage - a.percentage);

  return {
    allocations,
    unlinkedMinutes,
    unlinkedPercentage: totalMinutes > 0 ? (unlinkedMinutes / totalMinutes) * 100 : 100,
  };
}

/**
 * Builds insights from the same period-scoped dataset displayed by the widgets.
 */
export function generateActionableInsights(dataset: AnalyticsDataset, goals: Goal[]): ActionableInsight[] {
  const insights: ActionableInsight[] = [];
  const habitDiagnostics = getHabitPerformanceDiagnostics(dataset);
  if (habitDiagnostics.strongestHabits.length > 0) {
    const habitNames = habitDiagnostics.strongestHabits
      .slice(0, 3)
      .map(({ habit }) => habit.name)
      .join(", ");
    insights.push({
      id: "strong_habits",
      type: "positive",
      title: "Strong Habit Performance",
      description: `Great job on ${habitNames} with completion rates of ${TOP_PERFORMING_THRESHOLD}% or higher!`,
    });
  }

  const habitToImprove = habitDiagnostics.habitRates
    .filter((item) => item.completionRate > 0)
    .sort((a, b) => a.completionRate - b.completionRate || a.habit.id - b.habit.id)[0];
  if (habitToImprove) {
    const { habit, completionRate } = habitToImprove;
    insights.push({
      id: "struggling_habit",
      type: "actionable",
      title: "Habit Needs Adjustment",
      description: `${habit.name} completion is at ${Math.round(completionRate)}% for ${dataset.range.horizon.toLowerCase()}. Try reducing its frequency or adjusting the schedule.`,
    });
  }

  const timeInsights = getTimeOfDayInsights(dataset.focusSessions);
  if (timeInsights.peakFocusWindow) {
    insights.push({
      id: "peak_time",
      type: "positive",
      title: "Most Focused Time",
      description: `You logged the most focus minutes during ${timeInsights.peakFocusWindow} hours. Schedule important tasks during this time.`,
    });
  }

  const frictionMetrics = getWeekdayFrictionMetrics(dataset);
  if (frictionMetrics.highestFrictionDay) {
    const dayMap: Record<Weekday, { completed: number; missed: number; frictionRate: number }> = {
      Monday: frictionMetrics.monday,
      Tuesday: frictionMetrics.tuesday,
      Wednesday: frictionMetrics.wednesday,
      Thursday: frictionMetrics.thursday,
      Friday: frictionMetrics.friday,
      Saturday: frictionMetrics.saturday,
      Sunday: frictionMetrics.sunday,
    };
    const dayData = dayMap[frictionMetrics.highestFrictionDay];
    if (dayData.frictionRate > 30) {
      insights.push({
        id: "friction_day",
        type: "warning",
        title: "High Friction Day",
        description: `${frictionMetrics.highestFrictionDay}s show a ${Math.round(dayData.frictionRate)}% rate of incomplete items. Consider lightening your schedule or adding buffer time.`,
      });
    }
  }

  // Goal focus allocation insights
  const goalAllocation = getGoalFocusAllocation(dataset.focusSessions, goals);
  const topGoal = goalAllocation.allocations[0];
  if (topGoal && topGoal.percentage > 50) {
    insights.push({
      id: "goal_focus",
      type: "positive",
      title: "Strong Goal Alignment",
      description: `${topGoal.percentage.toFixed(0)}% of your focus time is aligned with "${topGoal.goalTitle}". Great prioritization!`,
    });
  } else if (goalAllocation.unlinkedPercentage > 50) {
    insights.push({
      id: "unlinked_focus",
      type: "actionable",
      title: "Link Focus to Goals",
      description: `${goalAllocation.unlinkedPercentage.toFixed(0)}% of your focus time is unlinked to goals. Consider linking sessions to specific goals for better tracking.`,
    });
  }

  return insights;
}

function getWeekday(dateKey: string): Weekday {
  const [year, month, day] = dateKey.split("-").map(Number);
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
    new Date(year, month - 1, day).getDay()
  ] as Weekday;
}

function getTimeBucket(hour: number): TimeBucket {
  if (hour >= 5 && hour < 12) return "Morning";
  if (hour >= 12 && hour < 17) return "Afternoon";
  if (hour >= 17 && hour < 21) return "Evening";
  return "Night";
}
