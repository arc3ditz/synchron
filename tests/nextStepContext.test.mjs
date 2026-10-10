import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  listNextStepCandidates,
  recommendNextStep,
  taskContextKind,
} from "../src/domain/nextStep.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const engineSource = readFileSync(path.join(root, "src/domain/nextStep.ts"), "utf8");

const TODAY = "2026-10-09";
const YESTERDAY = "2026-10-08";

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

function input(overrides = {}) {
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

function activeProjectContext() {
  const projects = [{ id: "p", name: "P", status: "active", createdAt: "2026-01-01" }];
  const milestones = [{ id: "m", projectId: "p", title: "M", completed: false }];
  return { projects, milestones };
}

// --- Goal / project associations order eligible contextual work ---
//
// Anchoring never widens eligibility (a goal-linked task with no due date
// or time block stays out, exactly as Today lists it): among eligible
// time-blocked tasks, anchored ones outrank standalone ones.

test("project-linked scheduled task outranks a standalone scheduled task", () => {
  const projects = [{ id: "p", name: "P", status: "active", createdAt: "2026-01-01" }];
  const rec = recommendNextStep(input({
    projects,
    tasks: [
      makeTask({
        id: "linked", title: "Linked", projectId: "p", dueDate: "2026-11-01",
        scheduledTime: "09:30", priority: "medium",
      }),
      makeTask({
        id: "solo", title: "Solo", dueDate: "2026-11-01",
        scheduledTime: "09:30", priority: "medium",
      }),
    ],
  }));
  assert.equal(rec.kind, "task");
  assert.equal(rec.taskId, "linked");
  assert.match(rec.reason, /Scheduled 09:30/);
});

test("project-linked scheduled task outranks a standalone scheduled task", () => {
  const projects = [{ id: "p", name: "P", status: "active", createdAt: "2026-01-01" }];
  const rec = recommendNextStep(input({
    projects,
    tasks: [
      makeTask({
        id: "linked", title: "Linked", projectId: "p", dueDate: "2026-11-01",
        scheduledTime: "09:30", priority: "medium",
      }),
      makeTask({
        id: "solo", title: "Solo", dueDate: "2026-11-01",
        scheduledTime: "09:30", priority: "medium",
      }),
    ],
  }));
  assert.equal(rec.kind, "task");
  assert.equal(rec.taskId, "linked");
});

test("milestone-linked task keeps its milestone reason and beats standalone", () => {
  const { projects, milestones } = activeProjectContext();
  const rec = recommendNextStep(input({
    projects,
    milestones,
    tasks: [
      makeTask({ id: "linked", title: "Linked", milestoneId: "m", priority: "medium" }),
      makeTask({
        id: "solo", title: "Solo", dueDate: "2026-11-01",
        scheduledTime: "09:30", priority: "medium",
      }),
    ],
  }));
  assert.equal(rec.kind, "task");
  assert.equal(rec.taskId, "linked");
  assert.match(rec.reason, /Active milestone/);
});

test("taskContextKind resolves links against existing entities only", () => {
  const lookup = {
    projectsById: new Map([["p", { id: "p", name: "P", status: "active" }]]),
    milestonesById: new Map([["m", { id: "m", title: "M", completed: false }]]),
  };
  assert.equal(taskContextKind(makeTask({ milestoneId: "m" }), lookup), "milestone");
  assert.equal(taskContextKind(makeTask({ projectId: "p" }), lookup), "project");
  assert.equal(taskContextKind(makeTask({}), lookup), "none");
  // Dangling references are standalone, never invented associations.
  // Legacy goalId links never anchor on their own.
  assert.equal(taskContextKind(makeTask({ goalId: "missing" }), lookup), "none");
  assert.equal(taskContextKind(makeTask({ goalId: "g" }), lookup), "none");
  assert.equal(taskContextKind(makeTask({ projectId: "missing" }), lookup), "none");
  assert.equal(taskContextKind(makeTask({ milestoneId: "missing" }), lookup), "none");
  // Finished parents don't anchor either.
  const doneLookup = {
    projectsById: new Map([["p", { id: "p", name: "P", status: "archived" }]]),
    milestonesById: new Map(),
  };
  assert.equal(taskContextKind(makeTask({ projectId: "p" }), doneLookup), "none");
});

test("dangling links get no boost and never invent a milestone reason", () => {
  // A dangling milestone id is treated as standalone work: the task is
  // recommendable as available work, but never as milestone-anchored work.
  const danglingSolo = recommendNextStep(input({
    tasks: [makeTask({ id: "dangling", title: "Dangling", milestoneId: "missing" })],
  }));
  assert.equal(danglingSolo.kind, "task");
  assert.equal(danglingSolo.taskId, "dangling");
  assert.match(danglingSolo.reason, /Available task/);
  assert.doesNotMatch(danglingSolo.reason, /milestone/i);

  // With a time block it is relevant, but standalone: a project-linked task
  // still wins, and its own reason claims only the schedule it has.
  const projects = [{ id: "p", name: "P", status: "active", createdAt: "2026-01-01" }];
  const ranked = recommendNextStep(input({
    projects,
    tasks: [
      makeTask({
        id: "dangling", title: "Dangling", milestoneId: "missing",
        dueDate: "2026-11-01", scheduledTime: "09:30", priority: "medium",
      }),
      makeTask({ id: "linked", title: "Linked", projectId: "p", dueDate: "2026-11-01", scheduledTime: "10:30", priority: "medium" }),
    ],
  }));
  assert.equal(ranked.kind, "task");
  assert.equal(ranked.taskId, "linked");

  const solo = recommendNextStep(input({
    tasks: [
      makeTask({
        id: "dangling", title: "Dangling", milestoneId: "missing",
        dueDate: "2026-11-01", scheduledTime: "09:30", priority: "medium",
      }),
    ],
  }));
  assert.equal(solo.kind, "task");
  assert.match(solo.reason, /Scheduled 09:30/);
  assert.doesNotMatch(solo.reason, /milestone/i);
});

// --- Recent completions break habit ties; completed work stays excluded ---

test("never-completed habit wins over one done yesterday when all else ties", () => {
  const rec = recommendNextStep(input({
    habits: [
      makeHabit({ id: 2, name: "Done yesterday", completedDates: [YESTERDAY] }),
      makeHabit({ id: 1, name: "Never done", completedDates: [] }),
    ],
  }));
  assert.equal(rec.kind, "habit");
  assert.equal(rec.habitId, 1);
});

test("habit done longest ago wins when duration and schedule tie", () => {
  const rec = recommendNextStep(input({
    habits: [
      makeHabit({ id: 2, name: "Recent", completedDates: [YESTERDAY] }),
      makeHabit({ id: 1, name: "Older", completedDates: ["2026-10-01"] }),
    ],
  }));
  assert.equal(rec.kind, "habit");
  assert.equal(rec.habitId, 1);
});

test("habit completed today is excluded in favor of incomplete work", () => {
  const rec = recommendNextStep(input({
    habits: [
      makeHabit({ id: 1, name: "Done", completedDates: [TODAY] }),
      makeHabit({ id: 2, name: "Open", completedDates: [YESTERDAY] }),
    ],
  }));
  assert.equal(rec.kind, "habit");
  assert.equal(rec.habitId, 2);
});

// --- Estimated effort, when known, breaks ties without invention ---

test("smaller habit effort wins; unknown effort never outranks known", () => {
  const small = recommendNextStep(input({
    habits: [
      makeHabit({ id: 1, name: "Big", durationMinutes: 60 }),
      makeHabit({ id: 2, name: "Small", durationMinutes: 10 }),
    ],
  }));
  assert.equal(small.habitId, 2);
  assert.equal(small.durationMinutes, 10);

  const known = recommendNextStep(input({
    habits: [
      makeHabit({ id: 1, name: "Unknown" }),
      makeHabit({ id: 2, name: "Known", durationMinutes: 20 }),
    ],
  }));
  assert.equal(known.habitId, 2);
});

test("linked task without estimates carries no invented duration", () => {
  const { projects, milestones } = activeProjectContext();
  const rec = recommendNextStep(input({
    projects,
    milestones,
    tasks: [makeTask({ id: "linked", title: "Linked", milestoneId: "m", priority: "medium" })],
  }));
  assert.equal(rec.kind, "task");
  assert.equal(rec.durationMinutes, undefined);
  assert.ok(!("durationMinutes" in rec) || rec.durationMinutes === undefined);
});

// --- Skips never resurface within the session while alternatives exist ---

test("skipped habit yields the next candidate; all skipped falls back honestly", () => {
  const base = input({
    habits: [
      makeHabit({ id: 1, name: "First" }),
      makeHabit({ id: 2, name: "Second" }),
    ],
  });
  const skippedOne = recommendNextStep({ ...base, skippedHabitIds: [1] });
  assert.equal(skippedOne.kind, "habit");
  assert.equal(skippedOne.habitId, 2);

  const allSkipped = recommendNextStep({ ...base, skippedHabitIds: [1, 2] });
  assert.equal(allSkipped.kind, "none");
  assert.match(allSkipped.reason, /skipped/i);
});

// --- Overdue nuance: fresh is urgent, stale is backlog ---

test("stale boundary: 7-day overdue is fresh, 8-day overdue is backlog", () => {
  const sevenDay = recommendNextStep(input({
    tasks: [
      makeTask({ id: "due", title: "Due", dueDate: TODAY, priority: "high" }),
      makeTask({ id: "aged", title: "Aged", dueDate: "2026-10-02", priority: "low" }),
    ],
  }));
  assert.equal(sevenDay.taskId, "aged");
  assert.doesNotMatch(sevenDay.reason, /backlog/);

  const eightDay = recommendNextStep(input({
    tasks: [makeTask({ id: "stale", title: "Stale", dueDate: "2026-10-01", priority: "high" })],
    habits: [makeHabit({ id: 9, name: "Read", priority: "Optional" })],
  }));
  assert.equal(eightDay.kind, "habit");
  assert.equal(eightDay.habitId, 9);
});

// --- Determinism with the new signals ---

test("ranking with links, effort, and history is deterministic", () => {
  const { projects, milestones } = activeProjectContext();
  const base = input({
    projects,
    milestones,
    tasks: [
      makeTask({ id: "b", title: "B", milestoneId: "m", priority: "medium", estimatedMinutes: 30 }),
      makeTask({ id: "a", title: "A", milestoneId: "m", priority: "medium", estimatedMinutes: 10 }),
    ],
    habits: [makeHabit({ id: 5, name: "H", completedDates: [YESTERDAY] })],
  });
  const first = recommendNextStep(base);
  const second = recommendNextStep(structuredClone(base));
  assert.deepEqual(first, second);
  assert.equal(first.taskId, "a");
  const options = listNextStepCandidates(structuredClone(base));
  assert.deepEqual(options[0], first);
});

// --- Limitations are documented, not hidden ---

test("engine documents its limitations instead of feigning intelligence", () => {
  assert.match(engineSource, /Limitations/);
  assert.match(engineSource, /session-scoped/);
  assert.match(engineSource, /no completion timestamp/);
  assert.match(engineSource, /Focus sessions are not an input/);
  assert.match(engineSource, /never invented|only echoed when present/);
});
