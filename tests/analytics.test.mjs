import assert from "node:assert/strict";
import test from "node:test";
import {
  generateActionableInsights,
  getFocusHeatmapData,
  getGoalFocusAllocation,
  getHabitFocusMinutes,
  getHabitPeriodStreak,
  getHabitPerformanceDiagnostics,
  getTimeOfDayInsights,
  getWeekdayFrictionMetrics,
  queryAnalyticsData,
} from "../src/domain/analytics.ts";

process.env.TZ = "Asia/Tokyo";

const now = new Date(2025, 4, 14, 12);
const timestampAt = (year, month, day, hour = 12) =>
  new Date(year, month, day, hour).getTime();

const habits = [{
  id: 1,
  name: "Daily",
  createdAt: "2025-04-01",
  priority: "Optional",
  type: "Daily",
  completedDates: ["2025-04-01", "2025-04-15", "2025-05-12", "2025-05-14", "2025-05-15"],
}];

const focusSessions = [
  { id: 1, timestamp: timestampAt(2025, 3, 14, 9), sessionType: "Timer", durationMinutes: 20, habitName: "Daily" },
  { id: 2, timestamp: timestampAt(2025, 3, 15, 10), sessionType: "Timer", durationMinutes: 30, habitName: "Daily" },
  { id: 3, timestamp: timestampAt(2025, 4, 12, 13), sessionType: "Timer", durationMinutes: 40, habitName: "Daily", goalId: "goal" },
  { id: 4, timestamp: timestampAt(2025, 4, 14, 19), sessionType: "Timer", durationMinutes: 60, habitName: "Daily", goalId: "goal" },
  { id: 5, timestamp: timestampAt(2025, 4, 15, 8), sessionType: "Timer", durationMinutes: 80, habitName: "Daily" },
];

const tasks = [
  { id: "apr14", title: "Earlier", dueDate: "2025-04-14", completed: true },
  { id: "apr15", title: "Boundary", dueDate: "2025-04-15", completed: false },
  { id: "may12", title: "Week", dueDate: "2025-05-12", completed: true },
  { id: "may14", title: "Today", dueDate: "2025-05-14", completed: false },
  { id: "may15", title: "Future", dueDate: "2025-05-15", completed: true },
];

function query(horizon) {
  return queryAnalyticsData({
    habits,
    tasks,
    focusSessions,
    horizon,
    weekStart: "Monday",
    dayResetHour: 0,
    now,
  });
}

test("uses the configured local week and filters each event source", () => {
  const data = query("This Week");
  assert.deepEqual(data.range, { horizon: "This Week", startDateKey: "2025-05-12", endDateKey: "2025-05-14" });
  assert.deepEqual(data.focusSessions.map((session) => session.id), [3, 4]);
  assert.deepEqual(data.taskOccurrences.map(({ task }) => task.id), ["may12", "may14"]);
  assert.deepEqual(data.habitOccurrences.map(({ dateKey }) => dateKey), ["2025-05-12", "2025-05-13", "2025-05-14"]);
});

test("uses the current local month as the month horizon", () => {
  const data = query("This Month");
  assert.equal(data.range.startDateKey, "2025-05-01");
  assert.deepEqual(data.focusSessions.map((session) => session.id), [3, 4]);
});

test("Last 30 Days contains exactly 30 local calendar dates including today", () => {
  const data = query("Last 30 Days");
  assert.equal(data.range.startDateKey, "2025-04-15");
  assert.equal(data.range.endDateKey, "2025-05-14");
  assert.deepEqual(data.focusSessions.map((session) => session.id), [2, 3, 4]);
  assert.deepEqual(data.taskOccurrences.map(({ task }) => task.id), ["apr15", "may12", "may14"]);
});

test("All Time includes valid past records but excludes future records", () => {
  const data = query("All Time");
  assert.equal(data.range.startDateKey, "2025-04-01");
  assert.deepEqual(data.focusSessions.map((session) => session.id), [1, 2, 3, 4]);
  assert.equal(data.taskOccurrences.some(({ task }) => task.id === "may15"), false);
});

test("every metric uses the same selected horizon", () => {
  const expected = {
    "This Week": { scheduled: 3, completed: 2, minutes: 100, tasks: 2 },
    "This Month": { scheduled: 14, completed: 2, minutes: 100, tasks: 2 },
    "Last 30 Days": { scheduled: 30, completed: 3, minutes: 130, tasks: 3 },
    "All Time": { scheduled: 44, completed: 4, minutes: 150, tasks: 4 },
  };
  const goals = [{ id: "goal", title: "Goal", status: "active", createdAt: "2025-01-01" }];

  for (const [horizon, totals] of Object.entries(expected)) {
    const data = query(horizon);
    const performance = getHabitPerformanceDiagnostics(data);
    const timeOfDay = getTimeOfDayInsights(data.focusSessions);
    const friction = getWeekdayFrictionMetrics(data);
    const allocation = getGoalFocusAllocation(data.focusSessions, goals);
    const heatmap = getFocusHeatmapData(data, "Monday", 0);
    const heatmapDays = heatmap.cells.filter((cell) => cell.type === "day");
    const totalOccurrences = [
      friction.monday,
      friction.tuesday,
      friction.wednesday,
      friction.thursday,
      friction.friday,
      friction.saturday,
      friction.sunday,
    ].reduce((sum, day) => sum + day.total, 0);

    assert.equal(performance.habitRates[0].expectedOccurrences, totals.scheduled, horizon);
    assert.equal(performance.habitRates[0].completedOccurrences, totals.completed, horizon);
    assert.equal(
      performance.habitRates[0].completionRate,
      (totals.completed / totals.scheduled) * 100,
      horizon,
    );
    assert.equal(
      timeOfDay.morningMinutes + timeOfDay.afternoonMinutes + timeOfDay.eveningMinutes + timeOfDay.nightMinutes,
      totals.minutes,
      horizon,
    );
    assert.equal(
      timeOfDay.morningSessions + timeOfDay.afternoonSessions + timeOfDay.eveningSessions + timeOfDay.nightSessions,
      data.focusSessions.length,
      horizon,
    );
    assert.equal(allocation.allocations.reduce((sum, item) => sum + item.minutes, 0) + allocation.unlinkedMinutes, totals.minutes);
    assert.equal(heatmap.hasData, true, horizon);
    assert.equal(heatmapDays[0].dateKey, data.range.startDateKey, horizon);
    assert.equal(heatmapDays.at(-1).dateKey, data.range.endDateKey, horizon);
    assert.equal(heatmapDays.reduce((sum, cell) => sum + cell.minutes, 0), totals.minutes, horizon);
    assert.equal(totalOccurrences, totals.scheduled + totals.tasks, horizon);
    assert.ok(Math.abs(
      allocation.allocations.reduce((sum, item) => sum + item.percentage, 0) + allocation.unlinkedPercentage - 100,
    ) < 0.001);
    assert.deepEqual(
      generateActionableInsights(data, goals).find((insight) => insight.id === "peak_time")?.description.includes(timeOfDay.peakFocusWindow),
      true,
      horizon,
    );
  }
});

test("daily, weekday-only, and custom-day habits count only scheduled occurrences", () => {
  const scheduledHabits = [
    { id: 10, name: "Daily", createdAt: "2025-05-12", priority: "Optional", type: "Daily", completedDates: ["2025-05-12"] },
    { id: 11, name: "Weekdays", createdAt: "2025-05-12", priority: "Optional", type: "Daily", frequencyType: "weekdays", completedDates: ["2025-05-12"] },
    { id: 12, name: "Custom", createdAt: "2025-05-12", priority: "Optional", type: "Daily", frequencyType: "custom", customDays: ["Mon", "Wed"], completedDates: ["2025-05-12"] },
  ];
  const data = queryAnalyticsData({ habits: scheduledHabits, tasks: [], focusSessions: [], horizon: "This Week", weekStart: "Monday", dayResetHour: 0, now });
  const rates = getHabitPerformanceDiagnostics(data).habitRates;

  assert.deepEqual(rates.map(({ expectedOccurrences, completedOccurrences }) => [expectedOccurrences, completedOccurrences]), [
    [3, 1],
    [3, 1],
    [2, 1],
  ]);
});

test("habit performance groups use the threshold boundaries and calculated completion rates", () => {
  const ratesToTest = [
    { name: "Top threshold", completed: 85, strongest: true, weakest: false },
    { name: "Below top threshold", completed: 84, strongest: false, weakest: false },
    { name: "Attention threshold", completed: 60, strongest: false, weakest: false },
    { name: "Needs attention", completed: 59, strongest: false, weakest: true },
    { name: "Displayed percentage", completed: 94, strongest: true, weakest: false },
  ];
  const dataset = {
    habitOccurrences: ratesToTest.flatMap(({ name, completed }, index) =>
      Array.from({ length: 100 }, (_, occurrenceIndex) => ({
        habit: { id: index + 1, name },
        dateKey: `2025-05-${String((occurrenceIndex % 31) + 1).padStart(2, "0")}`,
        completed: occurrenceIndex < completed,
      })),
    ),
  };
  const performance = getHabitPerformanceDiagnostics(dataset);

  assert.deepEqual(
    performance.strongestHabits.map(({ habit }) => habit.name),
    ["Displayed percentage", "Top threshold"],
  );
  assert.deepEqual(
    performance.weakestHabits.map(({ habit }) => habit.name),
    ["Needs attention"],
  );
  for (const expected of ratesToTest) {
    const rate = performance.habitRates.find(({ habit }) => habit.name === expected.name);
    assert.equal(rate.completionRate, expected.completed);
    assert.equal(Math.round(rate.completionRate), expected.completed);
    assert.equal(performance.strongestHabits.includes(rate), expected.strongest);
    assert.equal(performance.weakestHabits.includes(rate), expected.weakest);
  }
});

test("habit performance lists sort by rate and break ties by habit id", () => {
  const rates = [
    { id: 6, name: "Attention 38", completed: 38 },
    { id: 4, name: "Top 96", completed: 96 },
    { id: 3, name: "Attention 25 later id", completed: 25 },
    { id: 2, name: "Top 96 earlier id", completed: 96 },
    { id: 1, name: "Attention 25 earlier id", completed: 25 },
    { id: 5, name: "Top 100", completed: 100 },
    { id: 7, name: "Attention 59", completed: 59 },
    { id: 8, name: "Top 85", completed: 85 },
  ];
  const dataset = {
    habitOccurrences: rates.flatMap(({ id, name, completed }) =>
      Array.from({ length: 100 }, (_, occurrenceIndex) => ({
        habit: { id, name },
        dateKey: `2025-05-${String((occurrenceIndex % 31) + 1).padStart(2, "0")}`,
        completed: occurrenceIndex < completed,
      })),
    ),
  };
  const performance = getHabitPerformanceDiagnostics(dataset);

  assert.deepEqual(
    performance.weakestHabits.map(({ habit }) => habit.name),
    ["Attention 25 earlier id", "Attention 25 later id", "Attention 38", "Attention 59"],
  );
  assert.deepEqual(
    performance.strongestHabits.map(({ habit }) => habit.name),
    ["Top 100", "Top 96 earlier id", "Top 96", "Top 85"],
  );
});

test("habit creation dates bound expected occurrences after Program Habits become normal Habits", () => {
  const boundedHabits = [
    { id: 13, name: "Created Midweek", createdAt: "2025-05-13", priority: "Optional", type: "Daily", completedDates: ["2025-05-12", "2025-05-13"] },
    { id: 14, name: "Migrated Program Habit", createdAt: "2025-05-01", priority: "Optional", type: "Daily", completedDates: ["2025-05-12", "2025-05-13", "2025-05-14"] },
    { id: 15, name: "Archived", createdAt: "2025-05-12", priority: "Optional", type: "Daily", isArchived: true, completedDates: ["2025-05-12"] },
  ];
  const data = queryAnalyticsData({ habits: boundedHabits, tasks: [], focusSessions: [], horizon: "This Week", weekStart: "Monday", dayResetHour: 0, now });
  const rates = getHabitPerformanceDiagnostics(data).habitRates;

  assert.deepEqual(rates.map(({ habit, expectedOccurrences, completedOccurrences }) => [habit.name, expectedOccurrences, completedOccurrences]), [
    ["Created Midweek", 2, 1],
    ["Migrated Program Habit", 3, 3],
  ]);
});

test("legacy habits infer their start from the earliest valid completion only when needed", () => {
  const compatibilityHabits = [
    { id: 16, name: "Modern", createdAt: "2025-05-14", priority: "Optional", type: "Daily", completedDates: ["2025-05-12", "2025-05-14"] },
    { id: 17, name: "Legacy", priority: "Optional", type: "Daily", completedDates: ["not-a-date", "2025-05-14", "2025-05-13"] },
  ];
  const data = queryAnalyticsData({ habits: compatibilityHabits, tasks: [], focusSessions: [], horizon: "This Week", weekStart: "Monday", dayResetHour: 0, now });

  assert.deepEqual(data.habitOccurrences.map(({ habit, dateKey, completed }) => [habit.name, dateKey, completed]), [
    ["Modern", "2025-05-14", true],
    ["Legacy", "2025-05-13", true],
    ["Legacy", "2025-05-14", true],
  ]);
});

test("timestamp-id daily habits count missed dates before their first completion", () => {
  const contentCreation = {
    id: 1790515133827,
    name: "Content Creation",
    priority: "Optional",
    type: "Daily",
    frequencyType: "daily",
    customDays: [],
    completedDates: ["2026-10-01", "2026-10-02"],
    isArchived: false,
  };
  const data = queryAnalyticsData({
    habits: [contentCreation],
    tasks: [],
    focusSessions: [],
    horizon: "This Week",
    weekStart: "Sunday",
    dayResetHour: 0,
    now: new Date(2026, 9, 2, 17),
  });
  const performance = getHabitPerformanceDiagnostics(data);

  assert.deepEqual(data.range, {
    horizon: "This Week",
    startDateKey: "2026-09-27",
    endDateKey: "2026-10-02",
  });
  assert.deepEqual(
    data.habitOccurrences.map(({ dateKey, completed }) => [dateKey, completed]),
    [
      ["2026-09-27", false],
      ["2026-09-28", false],
      ["2026-09-29", false],
      ["2026-09-30", false],
      ["2026-10-01", true],
      ["2026-10-02", true],
    ],
  );
  assert.equal(performance.habitRates[0].completedOccurrences, 2);
  assert.equal(performance.habitRates[0].expectedOccurrences, 6);
  assert.equal(performance.habitRates[0].completionRate, (2 / 6) * 100);
});

test("missed occurrences are based only on scheduled dates in the selected period", () => {
  const habit = { id: 20, name: "New", createdAt: "2025-05-14", priority: "Optional", type: "Daily", completedDates: [] };
  const data = queryAnalyticsData({ habits: [habit], tasks: [], focusSessions: [], horizon: "This Week", weekStart: "Monday", dayResetHour: 0, now });
  const friction = getWeekdayFrictionMetrics(data);

  assert.equal(data.habitOccurrences.length, 1);
  assert.equal(friction.wednesday.missed, 1);
  assert.equal(friction.monday.total + friction.tuesday.total + friction.wednesday.total, 1);
});

test("focus buckets distinguish minutes from session counts", () => {
  const data = query("This Week");
  const timeOfDay = getTimeOfDayInsights(data.focusSessions);

  assert.equal(timeOfDay.afternoonMinutes, 40);
  assert.equal(timeOfDay.afternoonSessions, 1);
  assert.equal(timeOfDay.eveningMinutes, 60);
  assert.equal(timeOfDay.eveningSessions, 1);
  assert.equal(timeOfDay.peakFocusWindow, "Evening");
});

test("time-of-day distribution reflects changed focus session data", () => {
  const sessions = [
    { id: 1, timestamp: timestampAt(2025, 4, 14, 8), durationMinutes: 55 },
    { id: 2, timestamp: timestampAt(2025, 4, 14, 13), durationMinutes: 40 },
    { id: 3, timestamp: timestampAt(2025, 4, 14, 19), durationMinutes: 95 },
    { id: 4, timestamp: timestampAt(2025, 4, 14, 22), durationMinutes: 75 },
  ];
  const initial = getTimeOfDayInsights(sessions);

  assert.deepEqual([
    initial.morningMinutes,
    initial.afternoonMinutes,
    initial.eveningMinutes,
    initial.nightMinutes,
  ], [55, 40, 95, 75]);
  assert.deepEqual([
    initial.morningSessions,
    initial.afternoonSessions,
    initial.eveningSessions,
    initial.nightSessions,
  ], [1, 1, 1, 1]);

  const changed = getTimeOfDayInsights([...sessions, {
    id: 5,
    timestamp: timestampAt(2025, 4, 14, 23),
    durationMinutes: 30,
  }]);

  assert.equal(changed.nightMinutes, 105);
  assert.equal(changed.nightSessions, 2);
  assert.equal(changed.peakFocusWindow, "Night");
});

test("goal allocation percentages use filtered minutes and sum to 100", () => {
  const data = query("Last 30 Days");
  const allocation = getGoalFocusAllocation(data.focusSessions, [{ id: "goal", title: "Goal" }]);

  assert.equal(allocation.allocations[0].minutes, 100);
  assert.equal(allocation.unlinkedMinutes, 30);
  assert.ok(Math.abs(allocation.allocations[0].percentage + allocation.unlinkedPercentage - 100) < 0.001);
});

test("goal insight recommends linking focus when the period has no goal-linked focus", () => {
  const data = queryAnalyticsData({
    habits: [],
    tasks: [],
    focusSessions: [{
      id: 91,
      timestamp: timestampAt(2025, 4, 14, 10),
      sessionType: "Timer",
      durationMinutes: 30,
    }],
    horizon: "This Week",
    weekStart: "Monday",
    dayResetHour: 0,
    now,
  });
  const goalAllocation = getGoalFocusAllocation(data.focusSessions, []);
  const insight = generateActionableInsights(data, []).find((item) => item.id === "unlinked_focus");

  assert.equal(goalAllocation.allocations.length, 0);
  assert.equal(goalAllocation.unlinkedPercentage, 100);
  assert.match(insight.description, /100% of your focus time is unlinked to goals/);
});

test("habit focus uses ids and does not merge duplicate names", () => {
  const duplicateHabits = [
    { ...habits[0], id: 30, createdAt: "2025-05-12" },
    { ...habits[0], id: 31, createdAt: "2025-05-12" },
  ];
  const sessions = [
    { ...focusSessions[2], id: 30, timestamp: timestampAt(2025, 4, 12), durationMinutes: 25, habitId: 30 },
    { ...focusSessions[2], id: 31, timestamp: timestampAt(2025, 4, 12), durationMinutes: 40, habitId: 31 },
    { ...focusSessions[2], id: 32, timestamp: timestampAt(2025, 4, 12), durationMinutes: 90, habitId: undefined },
  ];
  const data = queryAnalyticsData({ habits: duplicateHabits, tasks: [], focusSessions: sessions, horizon: "This Week", weekStart: "Monday", dayResetHour: 0, now });
  const minutes = getHabitFocusMinutes(data);

  assert.equal(minutes.get(30), 25);
  assert.equal(minutes.get(31), 40);
  assert.equal(minutes.size, 2);
});

test("legacy focus attribution uses a name only when exactly one habit matches", () => {
  const singleHabit = { ...habits[0], id: 40, createdAt: "2025-05-12" };
  const sessions = [{
    ...focusSessions[2],
    id: 40,
    timestamp: timestampAt(2025, 4, 12),
    durationMinutes: 25,
    habitId: undefined,
  }];
  const data = queryAnalyticsData({ habits: [singleHabit], tasks: [], focusSessions: sessions, horizon: "This Week", weekStart: "Monday", dayResetHour: 0, now });

  assert.equal(getHabitFocusMinutes(data).get(40), 25);
});

test("period streaks count consecutive completions only within the selected range", () => {
  const habit = {
    ...habits[0],
    createdAt: "2025-04-01",
    completedDates: Array.from({ length: 44 }, (_, index) => {
      const date = new Date(2025, 3, 1 + index);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }),
  };
  const streaks = ["This Week", "This Month", "Last 30 Days", "All Time"].map((horizon) => {
    const data = queryAnalyticsData({ habits: [habit], tasks: [], focusSessions: [], horizon, weekStart: "Monday", dayResetHour: 0, now });
    return getHabitPeriodStreak(data, habit);
  });

  assert.deepEqual(streaks, [3, 14, 30, 44]);
});

test("weakest-habit insight reports that habit's rate, not the overall rate", () => {
  const insightHabits = [
    { id: 50, name: "Needs Work", createdAt: "2025-05-12", priority: "Optional", type: "Daily", completedDates: ["2025-05-12"] },
    { id: 51, name: "Strong", createdAt: "2025-05-12", priority: "Optional", type: "Daily", completedDates: ["2025-05-12", "2025-05-13", "2025-05-14"] },
  ];
  const data = queryAnalyticsData({ habits: insightHabits, tasks: [], focusSessions: [], horizon: "This Week", weekStart: "Monday", dayResetHour: 0, now });
  const insight = generateActionableInsights(data, []).find((item) => item.id === "struggling_habit");

  assert.match(insight.description, /Needs Work completion is at 33%/);
  assert.doesNotMatch(insight.description, /67%/);
});

test("habit improvement recommendation skips zero percent and selects lowest non-zero rate", () => {
  const insightHabits = [
    { id: 52, name: "Workout", createdAt: "2025-05-12", priority: "Optional", type: "Daily", completedDates: [] },
    { id: 53, name: "Reading", createdAt: "2025-05-12", priority: "Optional", type: "Daily", completedDates: ["2025-05-12"] },
    { id: 54, name: "Meditation", createdAt: "2025-05-12", priority: "Optional", type: "Daily", completedDates: ["2025-05-12", "2025-05-13"] },
    { id: 55, name: "Journaling", createdAt: "2025-05-12", priority: "Optional", type: "Daily", completedDates: ["2025-05-12", "2025-05-13", "2025-05-14"] },
  ];
  const data = queryAnalyticsData({ habits: insightHabits, tasks: [], focusSessions: [], horizon: "This Week", weekStart: "Monday", dayResetHour: 0, now });
  const insight = generateActionableInsights(data, []).find((item) => item.id === "struggling_habit");

  assert.match(insight.description, /Reading completion is at 33%/);
  assert.doesNotMatch(insight.description, /Workout/);
});

test("logical local dates respect timezone and configured day reset", () => {
  const localMidnight = new Date(2025, 4, 14, 0, 30);
  const session = { id: 90, timestamp: localMidnight.getTime(), sessionType: "Timer", durationMinutes: 15, habitName: "Daily" };
  const data = queryAnalyticsData({
    habits: [{ ...habits[0], createdAt: "2025-05-13", completedDates: ["2025-05-13"] }],
    tasks: [{ id: "date-only", title: "Date", dueDate: "2025-05-13", completed: true }],
    focusSessions: [session],
    horizon: "This Week",
    weekStart: "Monday",
    dayResetHour: 2,
    now: new Date(2025, 4, 14, 1),
  });

  assert.equal(data.range.endDateKey, "2025-05-13");
  assert.equal(data.focusSessions.length, 1);
  assert.equal(data.habitOccurrences[0].dateKey, "2025-05-13");
  assert.equal(data.taskOccurrences[0].dateKey, "2025-05-13");
});

test("habits without a valid creation or completion date keep neutral no-data results", () => {
  const unknownStart = { ...habits[0], createdAt: "invalid", completedDates: ["also-invalid"] };
  const data = queryAnalyticsData({ habits: [unknownStart], tasks: [], focusSessions: [], horizon: "This Week", weekStart: "Monday", dayResetHour: 0, now });
  const performance = getHabitPerformanceDiagnostics(data);
  const timeOfDay = getTimeOfDayInsights(data.focusSessions);
  const friction = getWeekdayFrictionMetrics(data);
  const allocation = getGoalFocusAllocation(data.focusSessions, []);
  const heatmap = getFocusHeatmapData(data, "Monday", 0);

  assert.equal(performance.overallCompletionRate, null);
  assert.equal(performance.hasData, false);
  assert.equal(timeOfDay.peakFocusWindow, null);
  assert.equal(friction.highestFrictionDay, null);
  assert.equal(allocation.unlinkedPercentage, 0);
  assert.equal(heatmap.hasData, false);
  assert.deepEqual(generateActionableInsights(data, []), []);
});

test("local date-only values do not shift to the prior UTC day", () => {
  const localDate = new Date(2025, 4, 14, 0, 30);
  const data = queryAnalyticsData({
    habits: [{ ...habits[0], createdAt: "2025-05-14", completedDates: ["2025-05-14"] }],
    tasks: [{ id: "today", title: "Today", dueDate: "2025-05-14", completed: true }],
    focusSessions: [{ ...focusSessions[0], timestamp: localDate.getTime() }],
    horizon: "This Week",
    weekStart: "Monday",
    dayResetHour: 0,
    now,
  });

  assert.equal(data.habitOccurrences[0].dateKey, "2025-05-14");
  assert.equal(data.taskOccurrences[0].dateKey, "2025-05-14");
  assert.equal(data.focusSessions.length, 1);
});