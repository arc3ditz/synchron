import assert from "node:assert/strict";
import test from "node:test";
import {
  countCompletedInWindow,
  getChallengeDayNumber,
  getChallengeMetadata,
  isChallengeActiveOnDate,
} from "../src/domain/programHabits.ts";

const program = {
  id: 5,
  name: "Reading Program",
  startDate: "2026-10-01",
  durationDays: 7,
  habitIds: [12],
};

const habit = {
  id: 12,
  name: "Read",
  priority: "Optional",
  type: "Challenge",
  programId: program.id,
  completedDates: ["2026-10-01", "2026-10-03", "2026-10-10"],
};

test("Program Habits use Program metadata for My Habits date filtering and progress", () => {
  assert.equal(habit.startDate, undefined);
  assert.equal(habit.durationDays, undefined);
  assert.deepEqual(getChallengeMetadata(habit, [program]), {
    startDate: program.startDate,
    durationDays: program.durationDays,
  });
  assert.equal(isChallengeActiveOnDate(habit, "2026-10-07", [program]), true);
  assert.equal(isChallengeActiveOnDate(habit, "2026-10-08", [program]), false);
  assert.equal(getChallengeDayNumber(habit, "2026-10-03", [program]), 3);
  assert.equal(countCompletedInWindow(habit, [program]), 2);
});

test("standalone Challenge Habits retain their own date metadata behavior", () => {
  const standaloneHabit = {
    ...habit,
    programId: undefined,
    startDate: "2026-10-02",
    durationDays: 3,
  };

  assert.equal(isChallengeActiveOnDate(standaloneHabit, "2026-10-04", []), true);
  assert.equal(isChallengeActiveOnDate(standaloneHabit, "2026-10-05", []), false);
});