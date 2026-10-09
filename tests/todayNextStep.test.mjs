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

test("preferMandatoryHabits=false keeps mandatory habits below contextual tasks", () => {
  const goals = [{ id: "g", title: "G", status: "active", createdAt: "2026-01-01" }];
  const milestones = [{ id: "m", goalId: "g", title: "M", completed: false }];
  const tasks = [makeTask({ id: "ctx", title: "Context", milestoneId: "m", priority: "high" })];
  const habits = [makeHabit({ id: 3, name: "Vitamins", priority: "Mandatory" })];

  const preferred = recommendNextStep(baseInput({ goals, milestones, tasks, habits }));
  assert.equal(preferred.kind, "habit", "default keeps mandatory preference");

  const neutral = recommendNextStep(
    baseInput({ goals, milestones, tasks, habits, preferMandatoryHabits: false }),
  );
  assert.equal(neutral.kind, "task");
  assert.equal(neutral.taskId, "ctx");
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
    todaySource.includes('aria-label="Choose another task or habit"'),
    "picker must be labelled for assistive tech",
  );
  assert.ok(todaySource.includes("listNextStepCandidates"), "picker lists engine-ordered options");
  assert.ok(todaySource.includes("chooseNextStep"), "picker pins the chosen candidate in place");
  assert.ok(!todaySource.includes("onNavigateToTasks"), "switching must not require navigation");
});

test("Today refreshes the pick on complete, skip, delete, or ineligibility", () => {
  assert.ok(todaySource.includes("skippedTaskIds") && todaySource.includes("skippedHabitIds"));
  assert.ok(
    todaySource.includes("chosenNextStepKey"),
    "pinned choice must be revalidated against current eligibility",
  );
  assert.ok(
    todaySource.includes("options.find((option) => nextStepKey(option) === chosenNextStepKey)"),
    "a pinned item that is completed, deleted, or ineligible falls back to the engine top",
  );
});

test("Today keeps empty and error states graceful with no redundant summaries", () => {
  assert.ok(todaySource.includes("All clear for today"), "all-done state stays friendly");
  assert.ok(
    todaySource.includes("Next step unavailable"),
    "engine failure must degrade to a quiet notice, not a blank page",
  );
  assert.ok(!todaySource.includes("Today's momentum"), "redundant momentum strip stays removed");
  assert.ok(
    !todaySource.includes("renderNextUp"),
    "old duplicated ranking must not survive alongside the engine",
  );
});
