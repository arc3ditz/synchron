import assert from "node:assert/strict";
import test from "node:test";
import { recommendNextStep } from "../src/domain/nextStep.ts";

const TODAY = "2026-10-09";
// 2026-10-09 is a Friday. Weekday/weekend/custom schedule tests rely on this.
const SATURDAY = "2026-10-10";

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

test("fresh overdue task outranks a task due today", () => {
  const rec = recommendNextStep(input({
    tasks: [
      makeTask({ id: "due", title: "Due today", dueDate: TODAY, priority: "high" }),
      makeTask({ id: "overdue", title: "Overdue", dueDate: "2026-10-08", priority: "low" }),
    ],
  }));
  assert.equal(rec.kind, "task");
  assert.equal(rec.taskId, "overdue");
  assert.match(rec.reason, /Overdue since 2026-10-08/);
});

test("task due today outranks a mandatory habit", () => {
  const rec = recommendNextStep(input({
    tasks: [makeTask({ id: "t", title: "Due", dueDate: TODAY, priority: "low" })],
    habits: [makeHabit({ id: 7, name: "Run", priority: "Mandatory" })],
  }));
  assert.equal(rec.kind, "task");
  assert.equal(rec.taskId, "t");
});

test("mandatory habit outranks a merely contextual milestone task", () => {
  const goals = [{ id: "g", title: "G", status: "active", createdAt: "2026-01-01" }];
  const milestones = [{ id: "m", goalId: "g", title: "M", completed: false }];
  const rec = recommendNextStep(input({
    goals,
    milestones,
    tasks: [makeTask({ id: "ctx", title: "Context", milestoneId: "m", priority: "high" })],
    habits: [makeHabit({ id: 3, name: "Vitamins", priority: "Mandatory" })],
  }));
  assert.equal(rec.kind, "habit");
  assert.equal(rec.habitId, 3);
});

test("stale backlog does not dominate: optional habit beats very old overdue", () => {
  const rec = recommendNextStep(input({
    tasks: [makeTask({ id: "stale", title: "Old", dueDate: "2026-08-01", priority: "high" })],
    habits: [makeHabit({ id: 9, name: "Read", priority: "Optional" })],
  }));
  assert.equal(rec.kind, "habit");
  assert.equal(rec.habitId, 9);
});

test("fresh overdue is preferred over stale backlog", () => {
  const rec = recommendNextStep(input({
    tasks: [
      makeTask({ id: "stale", title: "Stale", dueDate: "2026-08-01", priority: "high" }),
      makeTask({ id: "fresh", title: "Fresh", dueDate: "2026-10-08", priority: "low" }),
    ],
  }));
  assert.equal(rec.kind, "task");
  assert.equal(rec.taskId, "fresh");
});

test("completed and archived items are excluded", () => {
  const rec = recommendNextStep(input({
    tasks: [
      makeTask({ id: "done", title: "Done", dueDate: TODAY, completed: true, priority: "high" }),
      makeTask({ id: "open", title: "Open", dueDate: TODAY, priority: "low" }),
    ],
    habits: [
      makeHabit({ id: 1, name: "Done habit", completedDates: [TODAY] }),
      makeHabit({ id: 2, name: "Archived", isArchived: true }),
    ],
  }));
  assert.equal(rec.kind, "task");
  assert.equal(rec.taskId, "open");
});

test("tasks under completed milestones, inactive goals, or finished projects are ineligible", () => {
  const goals = [
    { id: "active", title: "A", status: "active", createdAt: "2026-01-01" },
    { id: "done-goal", title: "D", status: "completed", createdAt: "2026-01-01" },
  ];
  const milestones = [
    { id: "m-done", goalId: "active", title: "MD", completed: true },
    { id: "m-ok", goalId: "active", title: "MO", completed: false },
  ];
  const projects = [
    { id: "p-done", name: "P", status: "completed", createdAt: "2026-01-01" },
  ];
  const rec = recommendNextStep(input({
    goals,
    milestones,
    projects,
    tasks: [
      makeTask({ id: "via-done", title: "Via done", milestoneId: "m-done", priority: "high" }),
      makeTask({ id: "goal-done", title: "Goal done", goalId: "done-goal", dueDate: TODAY, priority: "high" }),
      makeTask({ id: "proj-done", title: "Proj done", projectId: "p-done", dueDate: TODAY, priority: "high" }),
      makeTask({ id: "ok", title: "Ok", milestoneId: "m-ok", priority: "low" }),
    ],
  }));
  assert.equal(rec.kind, "task");
  assert.equal(rec.taskId, "ok");
});

test("scheduled task is relevant even with a future due date and keeps its estimate", () => {
  const rec = recommendNextStep(input({
    tasks: [makeTask({
      id: "sched",
      title: "Blocked",
      dueDate: "2026-11-01",
      scheduledTime: "09:30",
      durationMinutes: 25,
      estimatedMinutes: 60,
      priority: "medium",
    })],
  }));
  assert.equal(rec.kind, "task");
  assert.equal(rec.taskId, "sched");
  assert.equal(rec.scheduledTime, "09:30");
  assert.equal(rec.durationMinutes, 25);
  assert.match(rec.reason, /Scheduled 09:30/);
});

test("duration falls back to estimatedMinutes and is omitted when unknown", () => {
  const withEstimate = recommendNextStep(input({
    tasks: [makeTask({ id: "e", title: "E", dueDate: TODAY, estimatedMinutes: 45 })],
  }));
  assert.equal(withEstimate.durationMinutes, 45);

  const without = recommendNextStep(input({
    tasks: [makeTask({ id: "n", title: "N", dueDate: TODAY })],
  }));
  assert.equal(without.durationMinutes, undefined);
  assert.ok(!("durationMinutes" in without) || without.durationMinutes === undefined);

  const habitWith = recommendNextStep(input({
    habits: [makeHabit({ id: 5, name: "H", durationMinutes: 10 })],
  }));
  assert.equal(habitWith.durationMinutes, 10);
});

test("invalid scheduledTime is ignored, never recommended as scheduled", () => {
  const rec = recommendNextStep(input({
    tasks: [makeTask({
      id: "bad",
      title: "Bad time",
      dueDate: "2026-11-01",
      scheduledTime: "9am",
      priority: "medium",
    })],
    habits: [makeHabit({ id: 11, name: "Daily read" })],
  }));
  // Future-due unscheduled task without milestone context is not relevant.
  assert.equal(rec.kind, "habit");
  assert.equal(rec.habitId, 11);
});

test("smaller actionable task wins when priority ties", () => {
  const rec = recommendNextStep(input({
    tasks: [
      makeTask({ id: "big", title: "Big", dueDate: TODAY, priority: "high", estimatedMinutes: 120 }),
      makeTask({ id: "small", title: "Small", dueDate: TODAY, priority: "high", estimatedMinutes: 10 }),
    ],
  }));
  assert.equal(rec.taskId, "small");
});

test("skipped top item yields the next candidate; all skipped yields fallback", () => {
  const base = input({
    tasks: [
      makeTask({ id: "first", title: "First", dueDate: "2026-10-08", priority: "high" }),
      makeTask({ id: "second", title: "Second", dueDate: TODAY, priority: "high" }),
    ],
  });
  const skippedOne = recommendNextStep({ ...base, skippedTaskIds: ["first"] });
  assert.equal(skippedOne.kind, "task");
  assert.equal(skippedOne.taskId, "second");

  const allSkipped = recommendNextStep({ ...base, skippedTaskIds: ["first", "second"] });
  assert.equal(allSkipped.kind, "none");
  assert.match(allSkipped.reason, /skipped/i);
});

test("empty state returns a predictable fallback with no duration", () => {
  const rec = recommendNextStep(input());
  assert.equal(rec.kind, "none");
  assert.ok(rec.title.length > 0 && rec.reason.length > 0);
  assert.equal(rec.durationMinutes, undefined);
});

test("date boundaries: today is due (not overdue); yesterday is overdue; schedule respects weekday", () => {
  const dueToday = recommendNextStep(input({
    tasks: [makeTask({ id: "t", title: "T", dueDate: TODAY, priority: "medium" })],
  }));
  assert.equal(dueToday.overdue, false);
  assert.match(dueToday.reason, /Due today/);

  const overdue = recommendNextStep(input({
    tasks: [makeTask({ id: "t", title: "T", dueDate: "2026-10-08", priority: "medium" })],
  }));
  assert.equal(overdue.overdue, true);

  // Weekdays-only habit is not scheduled on Saturday, so there is no action.
  const saturday = recommendNextStep(input({
    todayKey: SATURDAY,
    habits: [makeHabit({ id: 21, name: "Weekday", frequencyType: "weekdays" })],
  }));
  assert.equal(saturday.kind, "none");

  const friday = recommendNextStep(input({
    todayKey: TODAY,
    habits: [makeHabit({ id: 21, name: "Weekday", frequencyType: "weekdays" })],
  }));
  assert.equal(friday.kind, "habit");
});

test("selection is deterministic with stable tie-breaking", () => {
  const base = input({
    tasks: [
      makeTask({ id: "b", title: "Same", dueDate: TODAY, priority: "medium", createdAt: "2026-01-02T00:00:00.000Z" }),
      makeTask({ id: "a", title: "Same", dueDate: TODAY, priority: "medium", createdAt: "2026-01-01T00:00:00.000Z" }),
    ],
  });
  const first = recommendNextStep(base);
  const second = recommendNextStep(structuredClone(base));
  assert.deepEqual(first, second);
  assert.equal(first.taskId, "a");
});
