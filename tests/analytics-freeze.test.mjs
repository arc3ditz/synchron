import assert from "node:assert/strict";
import test from "node:test";
import {
  getHabitPeriodStreak,
  getHabitPerformanceDiagnostics,
  getWeekdayFrictionMetrics,
  queryAnalyticsData,
} from "../src/domain/analytics.ts";
import { calculateStreak, getDateKey, shiftDateKey } from "../src/utils/dates.ts";

process.env.TZ = "Asia/Tokyo";

const now = new Date(2025, 4, 14, 12); // Wed 2025-05-14
const base = {
  priority: "Optional",
  type: "Daily",
};

function query(habits, opts = {}) {
  return queryAnalyticsData({
    habits,
    tasks: [],
    focusSessions: [],
    horizon: "This Week",
    weekStart: "Monday",
    dayResetHour: 0,
    now,
    ...opts,
  });
}

test("1. individual freeze preserves a period streak", () => {
  const habit = { id: 101, name: "A", createdAt: "2025-05-12", ...base, completedDates: ["2025-05-12", "2025-05-14"], streakFreezeDates: ["2025-05-13"] };
  const frozen = query([habit]);
  assert.equal(getHabitPeriodStreak(frozen, habit), 3);

  const unfrozenHabit = { id: 101, name: "A", createdAt: "2025-05-12", ...base, completedDates: ["2025-05-12", "2025-05-14"] };
  const plain = query([unfrozenHabit]);
  assert.equal(getHabitPeriodStreak(plain, unfrozenHabit), 1);
});

test("2. individual freeze does not count as a completion", () => {
  const habit = { id: 102, name: "A", createdAt: "2025-05-12", ...base, completedDates: ["2025-05-12", "2025-05-14"], streakFreezeDates: ["2025-05-13"] };
  const data = query([habit]);
  const occ = data.habitOccurrences.find((o) => o.dateKey === "2025-05-13");
  assert.equal(occ.completed, false);
  assert.equal(occ.protected, true);
  // underlying data keeps the distinction
  assert.equal(habit.completedDates.includes("2025-05-13"), false);
  const rate = getHabitPerformanceDiagnostics(data).habitRates[0];
  assert.equal(rate.completedOccurrences, 2);
  assert.equal(rate.expectedOccurrences, 2);
  assert.equal(rate.completionRate, 100);
});

test("3. individual freeze does not appear as a missed day", () => {
  const habit = { id: 103, name: "A", createdAt: "2025-05-12", ...base, completedDates: ["2025-05-12", "2025-05-14"], streakFreezeDates: ["2025-05-13"] };
  const data = query([habit]);
  const friction = getWeekdayFrictionMetrics(data);
  // 2025-05-13 is a Tuesday
  assert.equal(friction.tuesday.total, 0);
  assert.equal(friction.tuesday.missed, 0);
  assert.equal(friction.monday.completed, 1);
  assert.equal(friction.wednesday.completed, 1);
});

test("4. another habit is unaffected by individual protection", () => {
  const habitA = { id: 104, name: "A", createdAt: "2025-05-12", ...base, completedDates: ["2025-05-12", "2025-05-14"], streakFreezeDates: ["2025-05-13"] };
  const habitB = { id: 105, name: "B", createdAt: "2025-05-12", ...base, completedDates: ["2025-05-12", "2025-05-14"] };
  const data = query([habitA, habitB]);
  assert.equal(getHabitPeriodStreak(data, habitA), 3);
  assert.equal(getHabitPeriodStreak(data, habitB), 1);
  const rates = getHabitPerformanceDiagnostics(data).habitRates;
  const rateB = rates.find((r) => r.habit.id === 105);
  assert.equal(rateB.expectedOccurrences, 3);
  assert.equal(rateB.completedOccurrences, 2);
  const friction = getWeekdayFrictionMetrics(data);
  // Tuesday still has B's miss
  assert.equal(friction.tuesday.missed, 1);
  assert.equal(friction.tuesday.total, 1);
});

test("5. global freeze remains compatible", () => {
  const habit = { id: 106, name: "A", createdAt: "2025-05-12", ...base, completedDates: ["2025-05-12", "2025-05-14"] };
  const data = query([habit], { streakFreeze: true });
  // global semantics: period streak counts true completions in range, never breaks
  assert.equal(getHabitPeriodStreak(data, habit, true), 2);
  const occ = data.habitOccurrences.find((o) => o.dateKey === "2025-05-13");
  assert.equal(occ.completed, false);
  assert.equal(occ.protected, true);
  const rate = getHabitPerformanceDiagnostics(data).habitRates[0];
  assert.equal(rate.completedOccurrences, 2);
  assert.equal(rate.expectedOccurrences, 2);
  const friction = getWeekdayFrictionMetrics(data);
  assert.equal(friction.tuesday.total, 0);
});

test("6. global and individual freeze coexist", () => {
  const habitA = { id: 107, name: "A", createdAt: "2025-05-12", ...base, completedDates: ["2025-05-14"], streakFreezeDates: ["2025-05-13"] };
  const habitB = { id: 108, name: "B", createdAt: "2025-05-12", ...base, completedDates: ["2025-05-14"] };
  const data = query([habitA, habitB], { streakFreeze: true });
  for (const h of [habitA, habitB]) {
    assert.equal(getHabitPeriodStreak(data, h, true), 1);
  }
  const rates = getHabitPerformanceDiagnostics(data).habitRates;
  for (const r of rates) {
    assert.equal(r.expectedOccurrences, 1);
    assert.equal(r.completedOccurrences, 1);
  }
  // without global, only A is protected on 05-13
  const solo = query([habitA, habitB]);
  assert.equal(getHabitPeriodStreak(solo, habitA), 2);
  assert.equal(getHabitPeriodStreak(solo, habitB), 1);
});

test("7. scheduled/frequency habits behave correctly with freezes", () => {
  // Weekdays habit: Tue 2025-05-13 is scheduled, so freeze preserves.
  const weekdays = { id: 109, name: "W", createdAt: "2025-05-12", ...base, frequencyType: "weekdays", completedDates: ["2025-05-12", "2025-05-14"], streakFreezeDates: ["2025-05-13"] };
  const data = query([weekdays]);
  assert.deepEqual(data.habitOccurrences.map((o) => o.dateKey), ["2025-05-12", "2025-05-13", "2025-05-14"]);
  assert.equal(getHabitPeriodStreak(data, weekdays), 3);

  // Custom Mon/Wed habit: Tue is unscheduled, so a freeze on Tue creates no occurrence and changes nothing.
  const custom = { id: 110, name: "C", createdAt: "2025-05-12", ...base, frequencyType: "custom", customDays: ["Mon", "Wed"], completedDates: ["2025-05-12"], streakFreezeDates: ["2025-05-13"] };
  const customData = query([custom]);
  assert.deepEqual(customData.habitOccurrences.map((o) => o.dateKey), ["2025-05-12", "2025-05-14"]);
  assert.equal(customData.habitOccurrences.every((o) => o.protected !== true), true);
  // Wed missed without protection breaks the trailing streak beginning: end missed -> streak counts Mon only
  assert.equal(getHabitPeriodStreak(customData, custom), 1);
});

test("8. analytics and calculateStreak agree on freeze scenarios", () => {
  const todayKey = getDateKey(new Date());
  const minus1 = shiftDateKey(todayKey, -1);
  const minus2 = shiftDateKey(todayKey, -2);
  const createdAt = shiftDateKey(todayKey, -10);

  const frozenHabit = {
    id: 111,
    name: "Agree",
    createdAt,
    ...base,
    completedDates: [minus2, todayKey],
    streakFreezeDates: [minus1],
  };
  const plainHabit = {
    id: 112,
    name: "Plain",
    createdAt,
    ...base,
    completedDates: [minus2, todayKey],
  };

  // Main streak system preserves across the frozen day and breaks without it.
  assert.ok(calculateStreak(frozenHabit, false, 0) >= 3);
  assert.equal(calculateStreak(plainHabit, false, 0), 1);

  const dataFrozen = queryAnalyticsData({
    habits: [frozenHabit],
    tasks: [],
    focusSessions: [],
    horizon: "Last 30 Days",
    weekStart: "Monday",
    dayResetHour: 0,
    now: new Date(),
  });
  const dataPlain = queryAnalyticsData({
    habits: [plainHabit],
    tasks: [],
    focusSessions: [],
    horizon: "Last 30 Days",
    weekStart: "Monday",
    dayResetHour: 0,
    now: new Date(),
  });
  const frozenStreak = getHabitPeriodStreak(dataFrozen, frozenHabit);
  const plainStreak = getHabitPeriodStreak(dataPlain, plainHabit);
  assert.ok(frozenStreak > plainStreak);
  assert.equal(plainStreak, 1);
  // Frozen middle day bridges: today + protected yesterday + day-before completion.
  assert.equal(frozenStreak, 3);
  // And the frozen day is not counted as a completion.
  const rate = getHabitPerformanceDiagnostics(dataFrozen).habitRates[0];
  const frozenOcc = dataFrozen.habitOccurrences.find((o) => o.dateKey === minus1);
  assert.equal(frozenOcc.completed, false);
  assert.equal(frozenOcc.protected, true);
  assert.ok(rate.expectedOccurrences < dataFrozen.habitOccurrences.length);
});
