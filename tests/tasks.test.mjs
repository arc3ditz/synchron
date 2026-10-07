import assert from "node:assert/strict";
import test from "node:test";
import {
  completeTask,
  createTask,
  deleteTask,
  filterTasksByGoal,
  filterTasksByMilestone,
  isTaskDueTodayOrOverdue,
  isTaskOverdue,
  resolveTaskContext,
  selectTodayTasks,
  sortTodayTasks,
  toggleTaskCompletion,
  updateTask,
} from "../src/domain/tasks.ts";
import { loadTasks, saveTasks } from "../src/utils/storage.ts";
import { alignTask, normalizeRelationships } from "../src/domain/relationships.ts";
import { detachTasksFromDeletedMilestone } from "../src/domain/goals.ts";
import { detachTasksFromDeletedProject } from "../src/domain/projects.ts";

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function withStorage(values, callback) {
  const storage = new MemoryStorage();
  for (const [key, value] of Object.entries(values)) storage.setItem(key, value);
  globalThis.localStorage = storage;
  try {
    callback(storage);
  } finally {
    delete globalThis.localStorage;
  }
}

const TODAY = "2025-05-14";

// --- Creation ---

test("createTask assigns a stable unique id and defaults", () => {
  const first = createTask({ title: "One", priority: "high" });
  const second = createTask({ title: "Two", priority: "high" });

  assert.equal(typeof first.id, "string");
  assert.notEqual(first.id, "");
  assert.notEqual(first.id, second.id);
  assert.equal(first.completed, false);
  assert.equal(typeof first.createdAt, "string");
  assert.equal(first.title, "One");
  assert.equal(first.priority, "high");
});

test("createTask preserves Goal/Project/Milestone links", () => {
  const task = createTask({
    title: "Linked",
    goalId: "goal-1",
    projectId: "project-1",
    milestoneId: "m-1",
    priority: "medium",
  });

  assert.equal(task.goalId, "goal-1");
  assert.equal(task.projectId, "project-1");
  assert.equal(task.milestoneId, "m-1");
});

// --- Persistence / backwards compatibility ---

test("loadTasks fills defaults for legacy minimal records", () => {
  withStorage({ tasks: JSON.stringify([{ id: "task-1", title: "Keep me" }]) }, () => {
    const [task] = loadTasks();
    assert.equal(task.id, "task-1");
    assert.equal(task.title, "Keep me");
    assert.equal(task.completed, false);
    assert.equal(task.priority, "medium");
    assert.equal(typeof task.createdAt, "string");
    assert.equal(task.goalId, undefined);
    assert.equal(task.projectId, undefined);
    assert.equal(task.milestoneId, undefined);
  });
});

test("loadTasks preserves stored relationships and completion", () => {
  const stored = [{
    id: "t-1",
    goalId: "goal-1",
    projectId: "project-1",
    milestoneId: "m-1",
    title: "Linked",
    dueDate: "2025-05-14",
    estimatedMinutes: 30,
    completed: true,
    priority: "high",
    createdAt: "2025-01-01T00:00:00.000Z",
  }];
  withStorage({ tasks: JSON.stringify(stored) }, () => {
    const [loaded] = loadTasks();
    assert.equal(loaded.id, "t-1");
    assert.equal(loaded.goalId, "goal-1");
    assert.equal(loaded.projectId, "project-1");
    assert.equal(loaded.milestoneId, "m-1");
    assert.equal(loaded.title, "Linked");
    assert.equal(loaded.dueDate, "2025-05-14");
    assert.equal(loaded.estimatedMinutes, 30);
    assert.equal(loaded.completed, true);
    assert.equal(loaded.priority, "high");
    assert.equal(loaded.createdAt, "2025-01-01T00:00:00.000Z");
  });
});

test("loadTasks drops corrupt entries but keeps valid Tasks", () => {
  const stored = [
    { id: "good", title: "Good", completed: false, priority: "medium", createdAt: "2025-01-01" },
    { id: "", title: "Empty id" },
    { id: "no-title", title: "   " },
    { id: 42, title: "Numeric id" },
    { title: "Missing id" },
  ];
  withStorage({ tasks: JSON.stringify(stored) }, () => {
    assert.deepEqual(loadTasks().map((task) => task.id), ["good"]);
  });
});

test("Tasks round-trip through save and load", () => {
  withStorage({}, () => {
    const task = createTask({ title: "Round trip", priority: "low", dueDate: TODAY });
    saveTasks([task]);
    const [loaded] = loadTasks();
    assert.equal(loaded.id, task.id);
    assert.equal(loaded.title, task.title);
    assert.equal(loaded.priority, "low");
    assert.equal(loaded.dueDate, TODAY);
    assert.equal(loaded.completed, false);
    assert.equal(loaded.createdAt, task.createdAt);
  });
});

// --- Completion ---

test("toggleTaskCompletion flips both ways without touching context", () => {
  const task = createTask({ title: "T", goalId: "goal-1", priority: "medium" });
  const done = toggleTaskCompletion(task);
  assert.equal(done.completed, true);
  assert.equal(done.goalId, "goal-1");
  assert.equal(task.completed, false);

  const reopened = toggleTaskCompletion(done);
  assert.equal(reopened.completed, false);
  assert.equal(reopened.id, task.id);
});

test("completeTask is idempotent and never reopens", () => {
  const task = createTask({ title: "T", priority: "medium" });
  const done = completeTask(task);
  assert.equal(done.completed, true);
  assert.equal(completeTask(done), done);
});

test("updateTask edits fields but preserves identity and completion", () => {
  const task = createTask({ title: "Before", priority: "low" });
  const done = completeTask(task);
  const updated = updateTask(done, { title: "After", priority: "high" });

  assert.equal(updated.id, task.id);
  assert.equal(updated.createdAt, task.createdAt);
  assert.equal(updated.completed, true);
  assert.equal(updated.title, "After");
});

test("deleteTask removes only the targeted Task", () => {
  const first = createTask({ title: "One", priority: "medium" });
  const second = createTask({ title: "Two", priority: "medium" });

  assert.deepEqual(deleteTask([first, second], first.id), [second]);
  assert.deepEqual(deleteTask([first, second], "missing"), [first, second]);
});

// --- Relationships ---

test("valid Task relationships survive normalization", () => {
  const goals = [{ id: "goal-1", title: "G", status: "active", createdAt: "2025-01-01" }];
  const projects = [{ id: "project-1", goalId: "goal-1", name: "P", status: "active", createdAt: "2025-01-01" }];
  const milestones = [{ id: "m-1", goalId: "goal-1", projectId: "project-1", title: "M", completed: false }];
  const tasks = [{ id: "t-1", goalId: "goal-1", projectId: "project-1", milestoneId: "m-1", title: "T", completed: false, priority: "medium", createdAt: "2025-01-01" }];

  const result = normalizeRelationships(goals, projects, milestones, tasks);
  assert.deepEqual(result.tasks, tasks);
});

test("standalone Tasks pass through normalization untouched", () => {
  const goals = [{ id: "goal-1", title: "G", status: "active", createdAt: "2025-01-01" }];
  const standalone = { id: "t-free", title: "Free", completed: false, priority: "medium", createdAt: "2025-01-01" };

  const result = normalizeRelationships(goals, [], [], [standalone]);
  assert.deepEqual(result.tasks, [standalone]);
});

test("dangling Task references are detached, never deleted", () => {
  const goals = [{ id: "goal-1", title: "G", status: "active", createdAt: "2025-01-01" }];
  const tasks = [{
    id: "t-1",
    goalId: "missing-goal",
    projectId: "missing-project",
    milestoneId: "missing-milestone",
    title: "T",
    completed: false,
    priority: "medium",
    createdAt: "2025-01-01",
  }];

  const result = normalizeRelationships(goals, [], [], tasks);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].goalId, undefined);
  assert.equal(result.tasks[0].projectId, undefined);
  assert.equal(result.tasks[0].milestoneId, undefined);
});

test("a Task under a Milestone resolves Project/Goal through it", () => {
  const milestones = [{ id: "m-1", goalId: "goal-b", projectId: "project-1", title: "M", completed: false }];
  const projects = [{ id: "project-1", goalId: "goal-b", name: "P", status: "active", createdAt: "2025-01-01" }];
  const stale = { id: "t-1", goalId: "goal-a", projectId: "other", milestoneId: "m-1", title: "T", completed: false, priority: "medium", createdAt: "2025-01-01" };

  const aligned = alignTask(stale, milestones, projects);
  assert.equal(aligned.goalId, "goal-b");
  assert.equal(aligned.projectId, "project-1");
  assert.equal(aligned.milestoneId, "m-1");
});

test("deleting a Milestone detaches its Tasks and backfills their Goal", () => {
  const milestone = { id: "m-1", goalId: "goal-1", title: "M", completed: false };
  const tasks = [
    { id: "t-1", milestoneId: "m-1", title: "Linked", completed: false, priority: "medium", createdAt: "2025-01-01" },
  ];

  assert.deepEqual(detachTasksFromDeletedMilestone(tasks, milestone), [
    { ...tasks[0], goalId: "goal-1", milestoneId: undefined },
  ]);
});

test("deleting a Project clears its reference from Tasks without deleting them", () => {
  const project = { id: "project-1", goalId: "goal-1", name: "P", status: "active", createdAt: "2025-01-01" };
  const tasks = [
    { id: "t-1", projectId: "project-1", title: "Direct", completed: false, priority: "medium", createdAt: "2025-01-01" },
    { id: "t-2", projectId: "other", title: "Untouched", completed: false, priority: "medium", createdAt: "2025-01-01" },
  ];

  const result = detachTasksFromDeletedProject(tasks, project);
  assert.equal(result.length, 2);
  assert.equal(result[0].projectId, undefined);
  assert.equal(result[0].goalId, "goal-1");
  assert.equal(result[1], tasks[1]);
});

test("filter helpers scope Tasks to a Goal or Milestone", () => {
  const tasks = [
    { id: "t-1", goalId: "goal-1", title: "One", completed: false, priority: "medium", createdAt: "2025-01-01" },
    { id: "t-2", goalId: "goal-1", milestoneId: "m-1", title: "Two", completed: false, priority: "medium", createdAt: "2025-01-01" },
    { id: "t-3", goalId: "goal-2", title: "Other", completed: false, priority: "medium", createdAt: "2025-01-01" },
  ];

  assert.deepEqual(filterTasksByGoal(tasks, "goal-1").map((task) => task.id), ["t-1", "t-2"]);
  assert.deepEqual(filterTasksByMilestone(tasks, "m-1").map((task) => task.id), ["t-2"]);
});

test("resolveTaskContext falls back through the Milestone without duplicating links", () => {
  const task = { milestoneId: "m-1" };
  const context = resolveTaskContext(task, {
    goals: [{ id: "goal-1", title: "Goal" }],
    projects: [{ id: "project-1", name: "Project" }],
    milestones: [{ id: "m-1", title: "Milestone", goalId: "goal-1", projectId: "project-1" }],
  });

  assert.equal(context.goal?.title, "Goal");
  assert.equal(context.project?.name, "Project");
  assert.equal(context.milestone?.title, "Milestone");
});

// --- Today selection ---

test("Today includes due-today and overdue Tasks but not future ones", () => {
  const tasks = [
    { id: "today", dueDate: TODAY, title: "Today", completed: false, priority: "medium", createdAt: "2025-01-01" },
    { id: "overdue", dueDate: "2025-05-10", title: "Overdue", completed: false, priority: "medium", createdAt: "2025-01-01" },
    { id: "future", dueDate: "2025-05-20", title: "Future", completed: false, priority: "medium", createdAt: "2025-01-01" },
    { id: "nodate", title: "No date", completed: false, priority: "medium", createdAt: "2025-01-01" },
  ];

  assert.equal(isTaskOverdue(tasks[1], TODAY), true);
  assert.equal(isTaskOverdue(tasks[0], TODAY), false);
  assert.equal(isTaskDueTodayOrOverdue(tasks[0], TODAY), true);
  assert.equal(isTaskDueTodayOrOverdue(tasks[3], TODAY), false);

  const selected = selectTodayTasks(tasks, { milestones: [], activeGoalIds: new Set(), todayKey: TODAY });
  assert.deepEqual(selected.map((task) => task.id).sort(), ["overdue", "today"]);
});

test("Today includes Tasks under active Milestones and keeps completed ones for reopening", () => {
  const goals = [{ id: "goal-1", title: "G", status: "active", createdAt: "2025-01-01" }];
  const activeGoalIds = new Set(goals.map((goal) => goal.id));
  const milestones = [
    { id: "m-active", goalId: "goal-1", title: "Active", completed: false },
    { id: "m-done", goalId: "goal-1", title: "Done", completed: true },
  ];
  const tasks = [
    { id: "via-active", milestoneId: "m-active", title: "Via active", completed: false, priority: "medium", createdAt: "2025-01-01" },
    { id: "via-done", milestoneId: "m-done", title: "Via done", completed: true, priority: "medium", createdAt: "2025-01-01" },
    { id: "done-today", dueDate: TODAY, title: "Done today", completed: true, priority: "medium", createdAt: "2025-01-01" },
  ];

  const selected = selectTodayTasks(tasks, { milestones, activeGoalIds, todayKey: TODAY });
  assert.deepEqual(selected.map((task) => task.id).sort(), ["done-today", "via-active"]);
});

test("Today ordering puts overdue first, then due date, then priority", () => {
  const tasks = [
    { id: "milestone-only", title: "Milestone", completed: false, priority: "high", createdAt: "2025-01-03" },
    { id: "today-low", dueDate: TODAY, title: "Today low", completed: false, priority: "low", createdAt: "2025-01-01" },
    { id: "overdue", dueDate: "2025-05-10", title: "Overdue", completed: false, priority: "low", createdAt: "2025-01-02" },
    { id: "today-high", dueDate: TODAY, title: "Today high", completed: false, priority: "high", createdAt: "2025-01-01" },
  ];

  assert.deepEqual(
    sortTodayTasks(tasks, TODAY).map((task) => task.id),
    ["overdue", "today-high", "today-low", "milestone-only"],
  );
});
