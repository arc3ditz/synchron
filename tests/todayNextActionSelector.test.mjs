import assert from "node:assert/strict";
import test from "node:test";
import { listTodayNextActions, selectTodayNextAction } from "../src/domain/nextStep.ts";

const TODAY = "2026-10-11";

function task(overrides = {}) {
  return {
    id: "task",
    title: "Task",
    completed: false,
    priority: "medium",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function habit(overrides = {}) {
  return {
    id: 1,
    name: "Habit",
    priority: "Mandatory",
    type: "Daily",
    completedDates: [],
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    habits: [],
    tasks: [],
    milestones: [],
    projects: [],
    todayKey: TODAY,
    ...overrides,
  };
}

test("Today action tiers put mandatory habits before overdue, due, project, and normal tasks", () => {
  const result = listTodayNextActions(input({
    habits: [habit()],
    tasks: [
      task({ id: "normal", title: "Normal" }),
      task({ id: "project-task", title: "Project task", projectId: "p1" }),
      task({ id: "due", title: "Due today", dueDate: TODAY }),
      task({ id: "overdue", title: "Overdue", dueDate: "2026-10-10" }),
    ],
    milestones: [{ id: "m1", projectId: "p1", title: "Milestone", completed: false }],
    projects: [{ id: "p1", name: "Project", status: "active", createdAt: TODAY }],
  }));
  assert.deepEqual(result.map((item) => item.title), [
    "Habit",
    "Overdue",
    "Due today",
    "Project task",
    "Milestone",
    "Normal",
  ]);
  assert.equal(selectTodayNextAction(input({
    habits: [habit()],
    tasks: [task({ id: "overdue", dueDate: "2026-10-10" })],
  })).kind, "habit");
});

test("only configured task priority breaks ties within the same task tier", () => {
  const result = listTodayNextActions(input({
    tasks: [
      task({ id: "later", title: "Later", dueDate: TODAY, priority: "low" }),
      task({ id: "first", title: "First", dueDate: TODAY, priority: "high" }),
      task({ id: "same-priority", title: "Same priority", dueDate: TODAY, priority: "high" }),
    ],
  }));
  assert.deepEqual(result.map((item) => item.title), ["First", "Same priority", "Later"]);
});

test("optional, completed, snoozed, archived, and finished-parent items are excluded", () => {
  const result = selectTodayNextAction(input({
    habits: [
      habit({ id: 1, name: "Optional", priority: "Optional" }),
      habit({ id: 2, name: "Done", completedDates: [TODAY] }),
      habit({ id: 3, name: "Archived", isArchived: true }),
      habit({ id: 4, name: "Snoozed" }),
    ],
    tasks: [
      task({ id: "done", title: "Done task", dueDate: TODAY, completed: true }),
      task({ id: "snoozed", title: "Snoozed task", dueDate: TODAY }),
      task({ id: "archived", title: "Archived task", projectId: "p-archived" }),
      task({ id: "finished-milestone", title: "Finished milestone task", milestoneId: "m-done" }),
    ],
    milestones: [{ id: "m-done", title: "Done milestone", completed: true }],
    projects: [{ id: "p-archived", name: "Archived", status: "archived", createdAt: TODAY }],
    skippedHabitIds: [4],
    skippedTaskIds: ["snoozed"],
  }));
  assert.equal(result.kind, "none");
  assert.match(result.reason, /Snoozed items will reappear/);
});

test("no eligible action returns a calm empty state instead of a forced recommendation", () => {
  const result = selectTodayNextAction(input({
    habits: [habit({ id: 2, completedDates: [TODAY] })],
    tasks: [
      task({ id: "done", completed: true }),
      task({ id: "future", dueDate: "2026-10-12" }),
      task({ id: "backlog", isBacklog: true }),
    ],
  }));
  assert.equal(result.kind, "none");
  assert.equal(result.title, "Nothing Needs Attention Right Now.");
  assert.match(result.reason, /will appear here when they are due/);
});

test("an incomplete active milestone can be selected, completed, and linked to its project", () => {
  const result = selectTodayNextAction(input({
    milestones: [
      { id: "archived-m", title: "Archived milestone", projectId: "p-archived", completed: false },
      { id: "active-m", title: "Active milestone", projectId: "p-active", completed: false },
    ],
    projects: [
      { id: "p-archived", name: "Archived", status: "archived", createdAt: TODAY },
      { id: "p-active", name: "Active", status: "active", createdAt: TODAY },
    ],
  }));
  assert.deepEqual(result, {
    kind: "milestone",
    milestoneId: "active-m",
    projectId: "p-active",
    title: "Active milestone",
    reason: "Active Project Milestone",
  });
});

test("projectless and orphaned milestones are not treated as relevant project work", () => {
  const result = selectTodayNextAction(input({
    milestones: [
      { id: "unlinked", title: "Unlinked milestone", completed: false },
      { id: "orphaned", title: "Orphaned milestone", projectId: "missing-project", completed: false },
    ],
  }));
  assert.equal(result.kind, "none");
});
