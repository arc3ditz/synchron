import assert from "node:assert/strict";
import test from "node:test";
import {
  archiveHabitsForFinishedProject,
  detachHabitsFromDeletedProject,
} from "../src/domain/projects.ts";
import { alignHabit, normalizeHabitProjectLinks } from "../src/domain/relationships.ts";
import { markHabitComplete } from "../src/domain/completions.ts";
import { calculateStreak, getTodayKey, shiftDateKey } from "../src/utils/dates.ts";
import { recommendNextStep, listNextStepCandidates } from "../src/domain/nextStep.ts";
import {
  getIntelligentNotification,
  shouldSendHabitTimingNotification,
} from "../src/domain/notificationLogic.ts";

const TODAY = "2026-10-09"; // Friday
const PROJECT = { id: "proj-bio", name: "Biology Exam Prep", status: "active", createdAt: "2026-01-01" };

function makeHabit(overrides = {}) {
  return {
    id: 1,
    name: "Read",
    priority: "Optional",
    type: "Daily",
    frequencyType: "daily",
    customDays: [],
    completedDates: [],
    ...overrides,
  };
}

function settings() {
  return {
    enableIntelligentNotifications: true,
    notificationFrequency: "frequent",
    habitReminders: true,
    incompleteHabitReminders: true,
  };
}

// 1. Ordinary standalone habits keep working with no Project.
test("standalone habit has no project link and stays schedulable", () => {
  const habit = makeHabit();
  assert.equal(habit.projectId, undefined);
  const aligned = alignHabit(habit, [PROJECT]);
  assert.equal(aligned.projectId, undefined);
  assert.deepEqual(aligned, habit);
});

// 2. A habit can be optionally associated with a Project.
test("habit can be associated with a Project without changing its schedule", () => {
  const habit = { ...makeHabit({ id: 2, name: "Study Biology for 20 minutes" }), projectId: PROJECT.id };
  const aligned = alignHabit(habit, [PROJECT]);
  assert.equal(aligned.projectId, PROJECT.id);
  assert.equal(aligned.name, "Study Biology for 20 minutes");
  assert.deepEqual(aligned.completedDates, []);
});

// 3. Completing a Project-associated habit reuses the shared completion path.
test("completing a project habit records history like any habit", () => {
  const habit = { ...makeHabit({ id: 3 }), projectId: PROJECT.id };
  const done = markHabitComplete(habit, TODAY, 1234567890);
  assert.ok(done.completedDates.includes(TODAY));
  assert.equal(done.completedAt[TODAY], 1234567890);
  assert.equal(done.projectId, PROJECT.id);
});

// 4. Streak and freezes are unaffected by the Project link.
test("streak and freeze history are preserved for project habits", () => {
  const todayKey = getTodayKey(0);
  const yesterday = shiftDateKey(todayKey, -1);
  const twoAgo = shiftDateKey(todayKey, -2);
  const habit = {
    ...makeHabit({ id: 4, completedDates: [twoAgo, yesterday] }),
    projectId: PROJECT.id,
  };
  assert.equal(calculateStreak(habit, false, 0), 2);
  const frozen = { ...habit, completedDates: [twoAgo], streakFreezeDates: [yesterday] };
  assert.equal(calculateStreak(frozen, false, 0), 2);
  // The link itself never changes the count.
  assert.equal(calculateStreak(habit, false, 0), calculateStreak({ ...habit, projectId: undefined }, false, 0));
});

// 5a. Finishing a Project archives linked habits but keeps history.
test("completing a project archives linked habits without erasing history", () => {
  const linked = { ...makeHabit({ id: 5, completedDates: [TODAY] }), projectId: PROJECT.id };
  const standalone = makeHabit({ id: 6, name: "Unrelated" });
  const archivedLinked = makeHabit({ id: 7, name: "Old", isArchived: true, projectId: PROJECT.id });
  const result = archiveHabitsForFinishedProject([linked, standalone, archivedLinked], PROJECT.id);
  assert.equal(result[0].isArchived, true);
  assert.deepEqual(result[0].completedDates, [TODAY]);
  assert.equal(result[1].isArchived, undefined);
  assert.equal(result[2].isArchived, true);
});

// 5b. Archiving uses the same path (status-gated), and delete detaches instead.
test("deleting a project detaches habits and keeps them usable", () => {
  const linked = { ...makeHabit({ id: 8, goalId: "legacy-goal" }), projectId: PROJECT.id };
  const result = detachHabitsFromDeletedProject([linked], PROJECT);
  assert.equal(result[0].projectId, undefined);
  assert.equal(result[0].goalId, "legacy-goal");
  assert.deepEqual(result[0].completedDates, []);
});

// 6. Missing or deleted Project references become standalone, never deleted.
test("dangling project references detach to standalone", () => {
  const habit = { ...makeHabit({ id: 9 }), projectId: "missing-project" };
  assert.equal(alignHabit(habit, [PROJECT]).projectId, undefined);
  const normalized = normalizeHabitProjectLinks([habit, makeHabit({ id: 10 })], []);
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].projectId, undefined);
  assert.equal(normalized[1].projectId, undefined);
});

// 7. Existing saved habit data (legacy goalId, no projectId) loads untouched.
test("legacy stored habits without projectId stay standalone with goalId intact", () => {
  const stored = { id: 11, name: "Legacy", goalId: "goal-1", completedDates: ["2026-01-01"] };
  const aligned = alignHabit(stored, [PROJECT]);
  assert.equal(aligned.projectId, undefined);
  assert.equal(aligned.goalId, "goal-1");
  assert.deepEqual(aligned.completedDates, ["2026-01-01"]);
});

// 8a. Next Step recommends an active project habit exactly once (no duplicates).
test("next step recommends a project habit once without duplication", () => {
  const habit = { ...makeHabit({ id: 12, name: "Study Biology for 20 minutes" }), projectId: PROJECT.id };
  const input = { habits: [habit], tasks: [], milestones: [], projects: [PROJECT], todayKey: TODAY };
  const rec = recommendNextStep(input);
  assert.equal(rec.kind, "habit");
  assert.equal(rec.habitId, 12);
  const options = listNextStepCandidates(input);
  assert.equal(options.filter((o) => o.kind === "habit" && o.habitId === 12).length, 1);
});

// 8b. Habits under finished Projects drop out of Next Step; dangling links stay eligible.
test("next step excludes habits under finished projects but keeps dangling ones", () => {
  const finished = { ...PROJECT, status: "completed" };
  const linked = { ...makeHabit({ id: 13 }), projectId: PROJECT.id };
  const recFinished = recommendNextStep({
    habits: [linked],
    tasks: [],
    milestones: [],
    projects: [finished],
    todayKey: TODAY,
  });
  assert.equal(recFinished.kind, "none");

  const dangling = { ...makeHabit({ id: 14 }), projectId: "gone" };
  const recDangling = recommendNextStep({
    habits: [dangling],
    tasks: [],
    milestones: [],
    projects: [PROJECT],
    todayKey: TODAY,
  });
  assert.equal(recDangling.kind, "habit");
  assert.equal(recDangling.habitId, 14);
});

// 8c. Notifications silence finished-project habits without changing standalone behavior.
test("notifications skip finished-project habits, keep standalone ones", () => {
  const timed = {
    ...makeHabit({ id: 15, scheduledTime: "09:00" }),
    projectId: PROJECT.id,
  };
  const finished = [{ id: PROJECT.id, status: "completed" }];
  assert.equal(shouldSendHabitTimingNotification(timed, 9, 0, finished), false);
  assert.equal(shouldSendHabitTimingNotification({ ...timed, projectId: undefined }, 9, 0, finished), true);

  const note = getIntelligentNotification([timed], 0, 9, 25, settings(), finished);
  assert.equal(note, null);
});
