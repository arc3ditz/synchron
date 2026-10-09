import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateStreak,
  getDateKey,
  getHabitDateKey,
  shiftDateKey,
} from "../src/utils/dates.ts";
import {
  getHabitPeriodStreak,
  queryAnalyticsData,
} from "../src/domain/analytics.ts";
import {
  markHabitComplete,
  markHabitIncomplete,
} from "../src/domain/completions.ts";

process.env.TZ = "Asia/Tokyo";

const todayKey = getDateKey(new Date());
const at = (offset) => shiftDateKey(todayKey, offset);
const base = {
  priority: "Optional",
  type: "Daily",
  createdAt: shiftDateKey(todayKey, -60),
};

let nextId = 1000;
function makeHabit(doneOffsets, freezeOffsets = [], overrides = {}) {
  return {
    id: nextId++,
    name: "Boundary",
    ...base,
    completedDates: doneOffsets.map(at),
    streakFreezeDates: freezeOffsets.map(at),
    ...overrides,
  };
}

function periodStreak(habit) {
  const dataset = queryAnalyticsData({
    habits: [habit],
    tasks: [],
    focusSessions: [],
    horizon: "Last 30 Days",
    weekStart: "Monday",
    dayResetHour: 0,
    now: new Date(),
  });
  return getHabitPeriodStreak(dataset, habit, false);
}

function assertEnginesAgree(habit, expected, label) {
  assert.equal(calculateStreak(habit, false, 0), expected, `${label} (calculateStreak)`);
  assert.equal(periodStreak(habit), expected, `${label} (period streak)`);
}

test("a freeze never resurrects a streak broken by a missed day", () => {
  // Missed yesterday sits between the freeze and today: only today counts.
  assertEnginesAgree(makeHabit([-4, 0], [-2]), 1, "freeze before a gap");
  // Freeze after the miss bridges only the contiguous tail.
  assertEnginesAgree(makeHabit([-4, 0], [-1]), 2, "miss, frozen yesterday, today");
  // Completed, missed, frozen, completed: frozen day counts, gap still breaks.
  assertEnginesAgree(makeHabit([-3, 0], [-1]), 2, "gap, frozen bridge, today");
});

test("consecutive frozen days bridge a run without counting as completions", () => {
  const habit = makeHabit([-4, 0], [-3, -2, -1]);
  assertEnginesAgree(habit, 5, "three frozen days in a row");
  assert.equal(
    habit.completedDates.includes(at(-1)),
    false,
    "bridged days stay out of completedDates",
  );
});

test("a frozen today is not counted but keeps yesterday's streak alive", () => {
  assertEnginesAgree(makeHabit([-1], [0]), 1, "done yesterday, frozen today");
  assertEnginesAgree(makeHabit([-2, -1], [0]), 2, "two-day run, frozen today");
});

test("missed days break the streak while completed runs count fully", () => {
  assertEnginesAgree(makeHabit([-2, -1, 0]), 3, "three-day run");
  assertEnginesAgree(makeHabit([-3, -2, 0]), 1, "missed yesterday");
  assertEnginesAgree(makeHabit([-3, -2, -1]), 3, "run ending yesterday, today pending");
});

test("independent habits keep independent protection dates", () => {
  const frozen = makeHabit([-2], [-1]);
  const plain = makeHabit([-2]);
  const otherFreeze = makeHabit([-2], [-3]);

  assert.equal(calculateStreak(frozen, false, 0), 2);
  assert.equal(calculateStreak(plain, false, 0), 0);
  assert.equal(calculateStreak(otherFreeze, false, 0), 0);
  assert.equal(periodStreak(frozen), 2);
  assert.equal(periodStreak(plain), 0);

  // Freezing one habit never leaks into another habit's stored dates.
  assert.deepEqual(plain.streakFreezeDates, []);
  assert.deepEqual(frozen.streakFreezeDates, [at(-1)]);
});

test("completing and uncompleting preserves streakFreezeDates", () => {
  const habit = makeHabit([], [-1]);
  const done = markHabitComplete(habit, at(0));
  assert.deepEqual(done.streakFreezeDates, [at(-1)]);
  assert.ok(done.completedDates.includes(at(0)));

  const undone = markHabitIncomplete(done, at(0));
  assert.deepEqual(undone.streakFreezeDates, [at(-1)], "uncompleting keeps protection");
  assert.deepEqual(undone.completedDates, []);
  assertEnginesAgree(undone, 1, "freeze from yesterday still bridges");
});

test("global freeze counts scheduled completions only and needs no individual dates", () => {
  const habit = makeHabit([-5, -3, -1], [-2]);
  assert.equal(calculateStreak(habit, true, 0), 3);

  const dataset = queryAnalyticsData({
    habits: [habit],
    tasks: [],
    focusSessions: [],
    horizon: "Last 30 Days",
    weekStart: "Monday",
    dayResetHour: 0,
    now: new Date(),
  });
  assert.equal(getHabitPeriodStreak(dataset, habit, true), 3);

  // A completion on an unscheduled day never counts, even globally frozen.
  const weekdayOnly = makeHabit([], [], { frequencyType: "weekdays" });
  const dayOfWeek = new Date().getDay();
  const lastSaturday = at(-(((dayOfWeek - 6 + 7) % 7) || 7));
  weekdayOnly.completedDates = [lastSaturday];
  assert.equal(calculateStreak(weekdayOnly, true, 0), 0);
});

test("freeze and completion days resolve to the correct logical day across midnight", () => {
  // 01:30 with a 02:00 reset still belongs to the previous logical day.
  const earlyMorning = new Date(2025, 4, 14, 1, 30);
  assert.equal(getHabitDateKey(earlyMorning, 2), "2025-05-13");
  assert.equal(getHabitDateKey(earlyMorning, 0), "2025-05-14");

  const habit = {
    id: 2001,
    name: "Night owl",
    priority: "Optional",
    type: "Daily",
    createdAt: "2025-05-10",
    completedDates: ["2025-05-12", "2025-05-13"],
    streakFreezeDates: ["2025-05-14"],
  };
  const dataset = queryAnalyticsData({
    habits: [habit],
    tasks: [],
    focusSessions: [],
    horizon: "This Week",
    weekStart: "Monday",
    dayResetHour: 2,
    now: earlyMorning,
  });

  assert.equal(dataset.range.endDateKey, "2025-05-13");
  assert.deepEqual(
    dataset.habitOccurrences.map((o) => o.dateKey),
    ["2025-05-12", "2025-05-13"],
    "the calendar-today freeze creates no occurrence on the logical yesterday",
  );
  assert.equal(getHabitPeriodStreak(dataset, habit, false), 2);
});
