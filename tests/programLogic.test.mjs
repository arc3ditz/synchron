import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateTodayProgress,
  getDayByDayProgress,
  groupHabitsIntoPrograms,
} from "../src/domain/programLogic.ts";

process.env.TZ = "Asia/Tokyo";

const RealDate = Date;

function withFixedDate(date, callback) {
  const timestamp = date.getTime();
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(timestamp);
      else super(...args);
    }

    static now() {
      return timestamp;
    }
  };

  try {
    callback();
  } finally {
    globalThis.Date = RealDate;
  }
}

function createProgramView(startDate, durationDays, firstCompletedDates, secondCompletedDates) {
  const program = {
    id: 1,
    name: "Test Program",
    startDate,
    durationDays,
    habitIds: [10, 11],
  };
  const habits = [
    {
      id: 10,
      name: "First",
      priority: "Optional",
      type: "Challenge",
      programId: program.id,
      completedDates: firstCompletedDates,
    },
    {
      id: 11,
      name: "Second",
      priority: "Optional",
      type: "Challenge",
      programId: program.id,
      completedDates: secondCompletedDates,
    },
  ];

  return groupHabitsIntoPrograms([program], habits, 4)[0];
}

test("a Program day is complete only when every scheduled Habit is complete", () => {
  withFixedDate(new RealDate(2025, 0, 8, 2), () => {
    const program = createProgramView("2025-01-01", 7, ["2025-01-07"], []);
    const today = calculateTodayProgress(program, "2025-01-07", 4);
    const day = getDayByDayProgress(program, 4).at(-1);

    assert.deepEqual(today, { completed: 1, total: 2, percent: 50 });
    assert.equal(program.completedDays, 0);
    assert.equal(day.status, "partial");
  });
});

test("Program today and ended-state calculations honor dayResetHour and clamp the day number", () => {
  withFixedDate(new RealDate(2025, 0, 8, 2), () => {
    const partialDates = Array.from({ length: 6 }, (_, index) => `2025-01-0${index + 1}`);
    const program = {
      id: 1,
      name: "Test Program",
      startDate: "2025-01-01",
      durationDays: 7,
      habitIds: [10, 11],
    };
    const habits = [
      { id: 10, name: "First", priority: "Optional", type: "Challenge", programId: 1, completedDates: [...partialDates, "2025-01-07"] },
      { id: 11, name: "Second", priority: "Optional", type: "Challenge", programId: 1, completedDates: partialDates },
    ];

    const beforeReset = groupHabitsIntoPrograms([program], habits, 4)[0];
    const afterReset = groupHabitsIntoPrograms([program], habits, 0)[0];

    assert.equal(beforeReset.state, "Active");
    assert.equal(beforeReset.currentDay, 7);
    assert.equal(beforeReset.completedDays, 6);
    assert.equal(afterReset.state, "Incomplete");
    assert.equal(afterReset.currentDay, 7);
  });
});

test("a Program is completed when all duration days meet the shared completion rule", () => {
  withFixedDate(new RealDate(2025, 0, 9, 12), () => {
    const completedDates = Array.from({ length: 7 }, (_, index) => `2025-01-0${index + 1}`);
    const program = createProgramView("2025-01-01", 7, completedDates, completedDates);

    assert.equal(program.state, "Completed");
    assert.equal(program.completedDays, 7);
    assert.equal(program.overallProgress, 100);
  });
});

test("daily Program progress is empty outside its date window", () => {
  withFixedDate(new RealDate(2025, 0, 9, 12), () => {
    const program = createProgramView("2025-01-01", 7, ["2025-01-09"], ["2025-01-09"]);

    assert.deepEqual(calculateTodayProgress(program, "2025-01-09", 4), {
      completed: 0,
      total: 0,
      percent: 0,
    });
  });
});