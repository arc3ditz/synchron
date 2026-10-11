import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  listNextStepCandidates,
  nextStepKey,
  recommendNextStep,
} from "../src/domain/nextStep.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const todaySource = readFileSync(path.join(root, "src/components/Today.tsx"), "utf8");

const TODAY = "2026-10-09";

function makeTask(overrides = {}) {
  return {
    id: "task-1",
    title: "Task",
    completed: false,
    priority: "medium",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeHabit(overrides = {}) {
  return {
    id: 1,
    name: "Habit",
    priority: "Optional",
    type: "Daily",
    completedDates: [],
    ...overrides,
  };
}

function baseInput(overrides = {}) {
  return {
    habits: [],
    tasks: [],
    goals: [],
    milestones: [],
    projects: [],
    todayKey: TODAY,
    ...overrides,
  };
}

// --- Engine list API: powers "choose another" without leaving Today ---

test("listNextStepCandidates returns the recommendation order, best first", () => {
  const fullInput = baseInput({
    tasks: [
      makeTask({ id: "due", title: "Due", dueDate: TODAY, priority: "low" }),
      makeTask({ id: "overdue", title: "Overdue", dueDate: "2026-10-08", priority: "low" }),
    ],
    habits: [makeHabit({ id: 4, name: "Read" })],
  });
  const options = listNextStepCandidates(fullInput);
  assert.ok(options.length >= 3, "every eligible candidate must be listed");
  assert.equal(options[0].kind, "task");
  assert.equal(options[0].taskId, "overdue");
  assert.deepEqual(options[0], recommendNextStep(fullInput));
  // Deterministic: same input, same order.
  assert.deepEqual(options, listNextStepCandidates(structuredClone(fullInput)));
});

test("nextStepKey is stable for pinning and skipping", () => {
  assert.equal(nextStepKey({ kind: "task", taskId: "abc" }), "task:abc");
  assert.equal(nextStepKey({ kind: "habit", habitId: 12 }), "habit:12");
});

test("mandatory habits keep their established priority over contextual tasks", () => {
  const milestones = [{ id: "m", title: "M", completed: false }];
  const tasks = [makeTask({ id: "ctx", title: "Context", milestoneId: "m", priority: "high" })];
  const habits = [makeHabit({ id: 3, name: "Vitamins", priority: "Mandatory" })];

  const preferred = recommendNextStep(baseInput({ milestones, tasks, habits }));
  assert.equal(preferred.kind, "habit");
});

// --- Today wiring: one hero, single primary Start, in-place switching ---

test("Today renders the engine hero with title, reason, and duration", () => {
  assert.ok(
    todaySource.includes('from "../domain/nextStep"'),
    "Today must reuse the engine instead of duplicating ranking",
  );
  assert.ok(todaySource.includes('data-testid="next-step"'), "hero needs a stable test hook");
  assert.ok(todaySource.includes("{nextStep.title}"), "hero shows the recommended title");
  assert.ok(todaySource.includes("{nextStep.reason}"), "hero shows the engine reason");
  assert.ok(
    todaySource.includes("nextStep.durationMinutes !== undefined"),
    "hero shows duration only when the engine provides one",
  );
});

test("Today hero has one prominent Start and quiet complete/skip actions", () => {
  const hero = todaySource.match(/function renderNextStep\(\)[\s\S]*?\n  \}/);
  assert.ok(hero, "hero must render through a single renderNextStep");
  assert.equal(
    hero[0].match(/styles\.submitButton/g)?.length ?? 0,
    1,
    "exactly one primary button (Start) in the hero",
  );
  assert.ok(hero[0].includes("Start ·"), "primary action starts the recommendation");
  assert.ok(hero[0].includes("completeNextStep"), "completing stays available but secondary");
  assert.ok(hero[0].includes("skipNextStep"), "skipping stays available but quiet");
  assert.ok(hero[0].includes("Not now"), "skip reads as a quiet deferral");
});

test("Today quick-starts the recommended item through the existing focus flow", () => {
  assert.ok(
    todaySource.includes("onQuickFocus({ taskId: nextStep.taskId, title: nextStep.title, durationMinutes: QUICK_FOCUS_MINUTES })"),
    "task Start must quick-start with the task link and short commitment",
  );
  assert.ok(
    todaySource.includes("onQuickFocus({ habitId: nextStep.habitId, title: nextStep.title, durationMinutes: QUICK_FOCUS_MINUTES })"),
    "habit Start must quick-start with the habit link and short commitment",
  );
  assert.ok(
    todaySource.includes("QUICK_FOCUS_MINUTES"),
    "hero must reuse the shared short-commitment constant, not a magic number",
  );
});

test("Today lets the user choose another candidate without navigating away", () => {
  assert.ok(
    todaySource.includes('aria-label="Choose Another Task, Habit, or Milestone"'),
    "picker must be labelled for assistive tech",
  );
  assert.ok(todaySource.includes("listTodayNextActions"), "picker lists deterministic Today-eligible options");
  assert.ok(todaySource.includes("chooseNextStep"), "picker pins the chosen candidate in place");
  assert.ok(!todaySource.includes("onNavigateToTasks"), "switching must not require navigation");
});

test("Today refreshes the pick on complete, skip, delete, or ineligibility", () => {
  assert.ok(todaySource.includes("activeSnoozes"), "active snoozes are excluded from recommendations");
  assert.ok(todaySource.includes("onSnoozeItem"), "Not now delegates persistent snoozing");
  assert.ok(
    todaySource.includes("chosenNextStepKey"),
    "pinned choice must be revalidated against current eligibility",
  );
});

test("Today exposes only mandatory habits to its list, progress, and recommendations", () => {
  assert.ok(todaySource.includes("selectTodayMandatoryHabits"), "Today uses the shared mandatory filter");
  assert.ok(todaySource.includes("habits: todayHabits"), "the recommendation only receives visible habits");
  assert.ok(todaySource.includes("activeSnoozes.habitIds.has(habit.id)"), "snoozed habits hide from Today");
  assert.ok(todaySource.includes("activeSnoozes.taskIds.has(task.id)"), "snoozed tasks hide from Today");
  assert.ok(todaySource.includes("calculateHabitSummary(todayHabits, todayKey)"), "habit progress uses the shared summary");
  assert.ok(todaySource.includes("todaySummary.doneCount} / {todaySummary.total} habits done"), "task counts do not inflate habit progress");
  assert.ok(!todaySource.includes("showMandatoryHabitsInImportantItems"), "Today has no visibility preference");
  assert.ok(
    todaySource.includes("options.find((option) => nextStepKey(option) === chosenNextStepKey)"),
    "a pinned item that is completed, deleted, or ineligible falls back to the engine top",
  );
});

test("Today keeps empty and error states graceful with no redundant summaries", () => {
  assert.ok(todaySource.includes("Nothing Needs Attention Right Now."), "empty state stays calm and friendly");
  assert.ok(
    todaySource.includes("Next Step Unavailable"),
    "engine failure must degrade to a quiet notice, not a blank page",
  );
  assert.ok(!todaySource.includes("Today's momentum"), "redundant momentum strip stays removed");
  assert.ok(
    !todaySource.includes("renderNextUp"),
    "old duplicated ranking must not survive alongside the engine",
  );
});
