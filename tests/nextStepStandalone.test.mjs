import assert from "node:assert/strict";
import test from "node:test";
import {
  listNextStepCandidates,
  recommendNextStep,
} from "../src/domain/nextStep.ts";

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

// 1. One undated standalone task is recommendable with no planning.

test("one undated standalone task is recommended as available work", () => {
  const rec = recommendNextStep(input({
    tasks: [makeTask({ id: "solo", title: "Buy milk" })],
  }));
  assert.equal(rec.kind, "task");
  assert.equal(rec.taskId, "solo");
  assert.match(rec.reason, /Available task/);
  assert.equal(rec.overdue, false);
  assert.equal(rec.dueDate, undefined);
  assert.equal(rec.scheduledTime, undefined);
});

// 2. Several undated tasks order by priority, then known effort.

test("undated tasks with different priorities rank high first", () => {
  const rec = recommendNextStep(input({
    tasks: [
      makeTask({ id: "low", title: "Low", priority: "low" }),
      makeTask({ id: "high", title: "High", priority: "high" }),
      makeTask({ id: "med", title: "Med", priority: "medium" }),
    ],
  }));
  assert.equal(rec.kind, "task");
  assert.equal(rec.taskId, "high");
});

test("undated priority ties break toward smaller known effort", () => {
  const rec = recommendNextStep(input({
    tasks: [
      makeTask({ id: "big", title: "Big", priority: "medium", estimatedMinutes: 120 }),
      makeTask({ id: "small", title: "Small", priority: "medium", estimatedMinutes: 10 }),
    ],
  }));
  assert.equal(rec.kind, "task");
  assert.equal(rec.taskId, "small");
  assert.equal(rec.durationMinutes, 10);
});

// 3. Undated work never outranks genuinely overdue work.

test("a mix of undated tasks, overdue tasks, and habits leads with overdue", () => {
  const rec = recommendNextStep(input({
    tasks: [
      makeTask({ id: "undated", title: "Undated", priority: "high" }),
      makeTask({ id: "overdue", title: "Overdue", dueDate: "2026-10-08", priority: "low" }),
    ],
    habits: [makeHabit({ id: 4, name: "Read" })],
  }));
  assert.equal(rec.kind, "task");
  assert.equal(rec.taskId, "overdue");
  assert.match(rec.reason, /Overdue since 2026-10-08/);
});

// 4. A task linked to an active project is eligible and outranks pure standalone.

test("a task linked to an active project is recommended with its link", () => {
  const projects = [{ id: "p", name: "P", status: "active", createdAt: "2026-01-01" }];
  const rec = recommendNextStep(input({
    projects,
    tasks: [
      makeTask({ id: "solo", title: "Solo", priority: "medium" }),
      makeTask({ id: "linked", title: "Linked", projectId: "p", priority: "medium" }),
    ],
  }));
  assert.equal(rec.kind, "task");
  assert.equal(rec.taskId, "linked");
  assert.match(rec.reason, /Linked project/);
});

// 5. Tasks in completed or archived projects stay ineligible.

test("a task linked to a completed or archived project is never recommended", () => {
  for (const status of ["completed", "archived"]) {
    const rec = recommendNextStep(input({
      projects: [{ id: "p", name: "P", status, createdAt: "2026-01-01" }],
      tasks: [makeTask({ id: "t", title: "T", projectId: "p", priority: "high" })],
    }));
    assert.equal(rec.kind, "none", `project status ${status} must exclude the task`);
  }
});

test("completed standalone tasks stay ineligible", () => {
  const rec = recommendNextStep(input({
    tasks: [makeTask({ id: "done", title: "Done", completed: true })],
  }));
  assert.equal(rec.kind, "none");
});

// 6. No remaining eligible work falls back honestly.

test("no eligible work returns the calm fallback", () => {
  const rec = recommendNextStep(input());
  assert.equal(rec.kind, "none");
  assert.ok(rec.title.length > 0 && rec.reason.length > 0);
  assert.equal(rec.durationMinutes, undefined);
});

// 7. Explanations stay honest: available is never urgent.

test("undated recommendations never imply urgency or a due date", () => {
  const rec = recommendNextStep(input({
    tasks: [makeTask({ id: "solo", title: "Solo", priority: "high" })],
  }));
  assert.equal(rec.kind, "task");
  assert.doesNotMatch(rec.reason, /Overdue|Due today|urgent|Scheduled|backlog/i);
  assert.equal(rec.overdue, false);
  assert.ok(!("dueDate" in rec) || rec.dueDate === undefined);
});

// Engine list API includes undated work for the "choose another" picker.

test("undated tasks appear in candidate order without extra skips", () => {
  const fullInput = input({
    tasks: [
      makeTask({ id: "b", title: "B", priority: "low" }),
      makeTask({ id: "a", title: "A", priority: "high" }),
    ],
  });
  const options = listNextStepCandidates(fullInput);
  assert.equal(options.length, 2);
  assert.equal(options[0].taskId, "a");
  assert.deepEqual(options[0], recommendNextStep(fullInput));
});
