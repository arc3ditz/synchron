import type { Habit, Task, Goal, FocusSessionRecord } from "../types";

// Time bucket types
type TimeBucket = "Morning" | "Afternoon" | "Evening" | "Night";
type Weekday = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";

export interface HabitPerformanceDiagnostics {
  strongestHabits: Habit[];
  weakestHabits: Habit[];
  overallCompletionRate: number;
}

export interface TimeOfDayInsights {
  morningMinutes: number;
  afternoonMinutes: number;
  eveningMinutes: number;
  nightMinutes: number;
  peakFocusWindow: TimeBucket;
}

export interface WeekdayFrictionMetrics {
  monday: { completed: number; missed: number; frictionRate: number };
  tuesday: { completed: number; missed: number; frictionRate: number };
  wednesday: { completed: number; missed: number; frictionRate: number };
  thursday: { completed: number; missed: number; frictionRate: number };
  friday: { completed: number; missed: number; frictionRate: number };
  saturday: { completed: number; missed: number; frictionRate: number };
  sunday: { completed: number; missed: number; frictionRate: number };
  highestFrictionDay: Weekday | null;
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

export interface ActionableInsight {
  id: string;
  type: "positive" | "warning" | "actionable";
  title: string;
  description: string;
}

/**
 * Calculates habit completion rates over each habit's active lifetime.
 * @param habits - Array of habits to analyze
 * @param logs - Array of habit completion logs (can be derived from habit.completedDates)
 * @returns Performance diagnostics with strongest/weakest habits and overall rate
 */
export function getHabitPerformanceDiagnostics(
  habits: Habit[],
  logs?: string[][],
): HabitPerformanceDiagnostics {
  void logs;

  if (!habits || habits.length === 0) {
    return {
      strongestHabits: [],
      weakestHabits: [],
      overallCompletionRate: 0,
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = toLocalDateKey(today);

  let totalExpectedCompletions = 0;
  let totalActualCompletions = 0;
  const habitRates: Array<{ habit: Habit; rate: number }> = [];

  for (const habit of habits) {
    if (habit.isArchived) continue;

    const completedDates = new Set(habit.completedDates || []);
    const startDateKey = getHabitActiveStartDate(habit, todayKey);
    const startDate = parseLocalDateKey(startDateKey);

    let expectedDays = 0;
    const checkDate = new Date(today);
    while (checkDate >= startDate) {
      const dayName = checkDate.toLocaleDateString("en-US", { weekday: "long" });
      if (isHabitScheduledForDay(habit, dayName)) expectedDays++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    if (expectedDays === 0) continue;

    const completionsInWindow = Array.from(completedDates).filter(
      (dateKey) => dateKey >= startDateKey && dateKey <= todayKey,
    ).length;

    const rate = expectedDays > 0 ? (completionsInWindow / expectedDays) * 100 : 0;
    
    totalExpectedCompletions += expectedDays;
    totalActualCompletions += completionsInWindow;
    habitRates.push({ habit, rate });
  }

  const overallCompletionRate = totalExpectedCompletions > 0 
    ? (totalActualCompletions / totalExpectedCompletions) * 100 
    : 0;

  const strongestHabits = habitRates
    .filter((h) => h.rate >= 80)
    .map((h) => h.habit);

  const weakestHabits = habitRates
    .filter((h) => h.rate < 50)
    .map((h) => h.habit);

  return {
    strongestHabits,
    weakestHabits,
    overallCompletionRate: Math.round(overallCompletionRate),
  };
}

/**
 * Groups focus sessions into time buckets and identifies peak focus window.
 * @param focusSessions - Array of focus session records
 * @returns Time distribution and peak window
 */
export function getTimeOfDayInsights(
  focusSessions: FocusSessionRecord[],
): TimeOfDayInsights {
  if (!focusSessions || focusSessions.length === 0) {
    return {
      morningMinutes: 0,
      afternoonMinutes: 0,
      eveningMinutes: 0,
      nightMinutes: 0,
      peakFocusWindow: "Morning",
    };
  }

  let morningMinutes = 0;
  let afternoonMinutes = 0;
  let eveningMinutes = 0;
  let nightMinutes = 0;

  for (const session of focusSessions) {
    const hour = new Date(session.timestamp).getHours();
    const bucket = getTimeBucket(hour);
    
    switch (bucket) {
      case "Morning":
        morningMinutes += session.durationMinutes;
        break;
      case "Afternoon":
        afternoonMinutes += session.durationMinutes;
        break;
      case "Evening":
        eveningMinutes += session.durationMinutes;
        break;
      case "Night":
        nightMinutes += session.durationMinutes;
        break;
    }
  }

  const buckets = [
    { name: "Morning" as TimeBucket, minutes: morningMinutes },
    { name: "Afternoon" as TimeBucket, minutes: afternoonMinutes },
    { name: "Evening" as TimeBucket, minutes: eveningMinutes },
    { name: "Night" as TimeBucket, minutes: nightMinutes },
  ];

  const peakFocusWindow = buckets.reduce((max, current) => 
    current.minutes > max.minutes ? current : max
  ).name;

  return {
    morningMinutes,
    afternoonMinutes,
    eveningMinutes,
    nightMinutes,
    peakFocusWindow,
  };
}

/**
 * Calculates friction/failure rates per weekday based on habit completions and task completions.
 * @param habits - Array of habits
 * @param logs - Optional habit completion logs (can use habit.completedDates)
 * @param tasks - Array of tasks
 * @returns Friction metrics per weekday and highest friction day
 */
export function getWeekdayFrictionMetrics(
  habits: Habit[],
  _logs?: string[][],
  tasks?: Task[],
): WeekdayFrictionMetrics {
  const weekdays: Weekday[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  
  const metrics: Record<Weekday, { completed: number; missed: number; frictionRate: number }> = {
    Monday: { completed: 0, missed: 0, frictionRate: 0 },
    Tuesday: { completed: 0, missed: 0, frictionRate: 0 },
    Wednesday: { completed: 0, missed: 0, frictionRate: 0 },
    Thursday: { completed: 0, missed: 0, frictionRate: 0 },
    Friday: { completed: 0, missed: 0, frictionRate: 0 },
    Saturday: { completed: 0, missed: 0, frictionRate: 0 },
    Sunday: { completed: 0, missed: 0, frictionRate: 0 },
  };

  // Analyze habit completions by weekday
  if (habits && habits.length > 0) {
    for (const habit of habits) {
      if (habit.isArchived) continue;

      const completedDates = habit.completedDates || [];
      const completedSet = new Set(completedDates);

      // For each completion date, check if it was scheduled
      for (const dateStr of completedDates) {
        const date = new Date(dateStr);
        const dayName = date.toLocaleDateString("en-US", { weekday: "long" }) as Weekday;
        
        if (isHabitScheduledForDay(habit, dayName)) {
          metrics[dayName].completed++;
        }
      }

      // Estimate missed completions (simplified: look at last 30 days)
      const today = new Date();
      for (let i = 0; i < 30; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(today.getDate() - i);
        const dateStr = checkDate.toISOString().split("T")[0];
        const dayName = checkDate.toLocaleDateString("en-US", { weekday: "long" }) as Weekday;

        if (isHabitScheduledForDay(habit, dayName) && !completedSet.has(dateStr)) {
          metrics[dayName].missed++;
        }
      }
    }
  }

  // Analyze task completions by weekday
  if (tasks && tasks.length > 0) {
    for (const task of tasks) {
      if (task.dueDate) {
        const dueDate = new Date(task.dueDate);
        const dayName = dueDate.toLocaleDateString("en-US", { weekday: "long" }) as Weekday;

        if (task.completed) {
          metrics[dayName].completed++;
        } else {
          // Only count as missed if due date has passed
          if (dueDate < new Date()) {
            metrics[dayName].missed++;
          }
        }
      }
    }
  }

  // Calculate friction rates
  let highestFrictionDay: Weekday | null = null;
  let highestFrictionRate = -1;

  for (const day of weekdays) {
    const total = metrics[day].completed + metrics[day].missed;
    metrics[day].frictionRate = total > 0 ? (metrics[day].missed / total) * 100 : 0;

    if (metrics[day].frictionRate > highestFrictionRate && total > 0) {
      highestFrictionRate = metrics[day].frictionRate;
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
  };
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
      unlinkedPercentage: 100,
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
 * Master function that combines all analytics to generate actionable insights.
 * @param params - Object containing all input data
 * @returns Array of actionable insights for the UI
 */
export function generateActionableInsights(params: {
  habits: Habit[];
  habitLogs?: string[][];
  tasks?: Task[];
  focusSessions: FocusSessionRecord[];
  goals: Goal[];
}): ActionableInsight[] {
  const insights: ActionableInsight[] = [];
  const { habits, habitLogs, tasks, focusSessions, goals } = params;

  // Habit performance insights
  const habitDiagnostics = getHabitPerformanceDiagnostics(habits, habitLogs);
  
  if (habitDiagnostics.strongestHabits.length > 0) {
    const habitNames = habitDiagnostics.strongestHabits
      .slice(0, 3)
      .map((h) => h.name)
      .join(", ");
    insights.push({
      id: "strong_habits",
      type: "positive",
      title: "Strong Habit Performance",
      description: `Great job on ${habitNames} with completion rates of 80% or higher!`,
    });
  }

  if (habitDiagnostics.weakestHabits.length > 0) {
    const habit = habitDiagnostics.weakestHabits[0];
    insights.push({
      id: "struggling_habit",
      type: "actionable",
      title: "Habit Needs Adjustment",
      description: `${habit.name} completion is at ${Math.round(habitDiagnostics.overallCompletionRate)}%. Try moving it to your peak focus window or reducing the frequency.`,
    });
  }

  // Time of day insights
  const timeInsights = getTimeOfDayInsights(focusSessions);
  if (focusSessions.length > 0) {
    insights.push({
      id: "peak_time",
      type: "positive",
      title: "Peak Performance Window",
      description: `Your focus sessions are most frequent during ${timeInsights.peakFocusWindow} hours. Schedule important tasks during this time.`,
    });
  }

  // Weekday friction insights
  const frictionMetrics = getWeekdayFrictionMetrics(habits, habitLogs, tasks);
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
  const goalAllocation = getGoalFocusAllocation(focusSessions, goals);
  if (goalAllocation.allocations.length > 0) {
    const topGoal = goalAllocation.allocations[0];
    if (topGoal.percentage > 50) {
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
  }

  return insights;
}

// Helper functions

function getHabitActiveStartDate(habit: Habit, todayKey: string): string {
  const creationDate = habit.createdAt
    ? toDateKey(habit.createdAt)
    : undefined;
  if (creationDate) return creationDate > todayKey ? todayKey : creationDate;

  const firstCompletion = (habit.completedDates || [])
    .map(toDateKey)
    .filter((dateKey): dateKey is string => typeof dateKey === "string" && dateKey <= todayKey)
    .sort()[0];
  if (firstCompletion) return firstCompletion;

  const challengeStart = habit.startDate ? toDateKey(habit.startDate) : undefined;
  return challengeStart && challengeStart <= todayKey ? challengeStart : todayKey;
}

function toDateKey(value: string): string | undefined {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (!match) return undefined;
  const parsed = parseLocalDateKey(match[1]);
  return toLocalDateKey(parsed) === match[1] ? match[1] : undefined;
}

function parseLocalDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isHabitScheduledForDay(habit: Habit, dayName: string): boolean {
  const frequency = habit.frequencyType || "daily";
  
  switch (frequency) {
    case "daily":
      return true;
    case "weekdays":
      return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].includes(dayName);
    case "weekends":
      return ["Saturday", "Sunday"].includes(dayName);
    case "custom":
      return habit.customDays?.includes(dayName) || false;
    default:
      return true;
  }
}

function getTimeBucket(hour: number): TimeBucket {
  if (hour >= 5 && hour < 12) return "Morning";
  if (hour >= 12 && hour < 17) return "Afternoon";
  if (hour >= 17 && hour < 21) return "Evening";
  return "Night";
}
