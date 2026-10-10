import assert from "node:assert/strict";
import test from "node:test";
import {
  completeTask,
  createTask,
  deleteTask,
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

test("createTask preserves Project/Milestone links and legacy goalId", () => {
  const task = createTask({
    title: "Linked",
    goalId: "legacy-goal",
    projectId: "project-1",
    milestoneId: "m-1",
    priority: "medium",
  });

  assert.equal(task.goalId, "legacy-goal");
  assert.equal(task.projectId, "project-1");
  assert.equal(task.milestoneId, "m-1");
});

test("createTask works standalone with title only", () => {
  const task = createTask({ title: "Solo", priority: "medium" });
  assert.equal(task.projectId, undefined);
  assert.equal(task.milestoneId, undefined);
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
    goalId: "legacy-goal",
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
    assert.equal(loaded.goalId, "legacy-goal");
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

test("loadTasks drops empty-string dueDates so Today and Next Step agree", () => {
  const stored = [
    { id: "empty", title: "Empty date", dueDate: "" },
    { id: "spaces", title: "Spaces date", dueDate: "   " },
    { id: "valid", title: "Valid date", dueDate: "2025-05-14" },
  ];
  withStorage({ tasks: JSON.stringify(stored) }, () => {
    const loaded = loadTasks();
    assert.equal(loaded.find((task) => task.id === "empty").dueDate, undefined);
    assert.equal(loaded.find((task) => task.id === "spaces").dueDate, undefined);
    assert.equal(loaded.find((task) => task.id === "valid").dueDate, "2025-05-14");
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
  const task = createTask({ title: "T", projectId: "project-1", priority: "medium" });
  const done = toggleTaskCompletion(task);
  assert.equal(done.completed, true);
  assert.equal(done.projectId, "project-1");
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
  const projects = [{ id: "project-1", name: "P", status: "active", createdAt: "2025-01-01" }];
  const milestones = [{ id: "m-1", projectId: "project-1", title: "M", completed: false }];
  const tasks = [{ id: "t-1", projectId: "project-1", milestoneId: "m-1", title: "T", completed: false, priority: "medium", createdAt: "2025-01-01" }];

  const result = normalizeRelationships(projects, milestones, tasks);
  assert.deepEqual(result.tasks, tasks);
});

test("standalone Tasks pass through normalization untouched", () => {
  const standalone = { id: "t-free", title: "Free", completed: false, priority: "medium", createdAt: "2025-01-01" };

  const result = normalizeRelationships([], [], [standalone]);
  assert.deepEqual(result.tasks, [standalone]);
});

test("legacy goalId fields are preserved verbatim by normalization", () => {
  const tasks = [{
    id: "t-1",
    goalId: "legacy-goal",
    projectId: "missing-project",
    milestoneId: "missing-milestone",
    title: "T",
    completed: false,
    priority: "medium",
    createdAt: "2025-01-01",
  }];

  const result = normalizeRelationships([], [], tasks);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].goalId, "legacy-goal");
  assert.equal(result.tasks[0].projectId, undefined);
  assert.equal(result.tasks[0].milestoneId, undefined);
});

test("a Task under a Milestone resolves its Project through it and preserves legacy goalId", () => {
  const milestones = [{ id: "m-1", projectId: "project-1", title: "M", completed: false }];
  const projects = [{ id: "project-1", name: "P", status: "active", createdAt: "2025-01-01" }];
  const stale = { id: "t-1", goalId: "legacy", projectId: "other", milestoneId: "m-1", title: "T", completed: false, priority: "medium", createdAt: "2025-01-01" };

  const aligned = alignTask(stale, milestones, projects);
  assert.equal(aligned.goalId, "legacy");
  assert.equal(aligned.projectId, "project-1");
  assert.equal(aligned.milestoneId, "m-1");
});

test("deleting a Milestone detaches its Tasks without deleting them", () => {
  const milestone = { id: "m-1", title: "M", completed: false };
  const tasks = [
    { id: "t-1", milestoneId: "m-1", title: "Linked", completed: false, priority: "medium", createdAt: "2025-01-01" },
  ];

  assert.deepEqual(detachTasksFromDeletedMilestone(tasks, milestone), [
    { ...tasks[0], milestoneId: undefined },
  ]);
});

test("deleting a Project clears its reference from Tasks without deleting them", () => {
  const project = { id: "project-1", name: "P", status: "active", createdAt: "2025-01-01" };
  const tasks = [
    { id: "t-1", projectId: "project-1", goalId: "legacy", title: "Direct", completed: false, priority: "medium", createdAt: "2025-01-01" },
    { id: "t-2", projectId: "other", title: "Untouched", completed: false, priority: "medium", createdAt: "2025-01-01" },
  ];

  const result = detachTasksFromDeletedProject(tasks, project);
  assert.equal(result.length, 2);
  assert.equal(result[0].projectId, undefined);
  assert.equal(result[0].goalId, "legacy");
  assert.equal(result[1], tasks[1]);
});

test("filter helpers scope Tasks to a Milestone", () => {
  const tasks = [
    { id: "t-1", projectId: "project-1", title: "One", completed: false, priority: "medium", createdAt: "2025-01-01" },
    { id: "t-2", projectId: "project-1", milestoneId: "m-1", title: "Two", completed: false, priority: "medium", createdAt: "2025-01-01" },
    { id: "t-3", projectId: "project-2", title: "Other", completed: false, priority: "medium", createdAt: "2025-01-01" },
  ];

  assert.deepEqual(filterTasksByMilestone(tasks, "m-1").map((task) => task.id), ["t-2"]);
});

test("resolveTaskContext falls back through the Milestone without duplicating links", () => {
  const task = { milestoneId: "m-1" };
  const context = resolveTaskContext(task, {
    projects: [{ id: "project-1", name: "Project" }],
    milestones: [{ id: "m-1", title: "Milestone", projectId: "project-1" }],
  });

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

  const selected = selectTodayTasks(tasks, { milestones: [], todayKey: TODAY });
  assert.deepEqual(selected.map((task) => task.id).sort(), ["overdue", "today"]);
});

test("Today includes Tasks under active Milestones and keeps completed ones for reopening", () => {
  const milestones = [
    { id: "m-active", title: "Active", completed: false },
    { id: "m-done", title: "Done", completed: true },
  ];
  const tasks = [
    { id: "via-active", milestoneId: "m-active", title: "Via active", completed: false, priority: "medium", createdAt: "2025-01-01" },
    { id: "via-done", milestoneId: "m-done", title: "Via done", completed: true, priority: "medium", createdAt: "2025-01-01" },
    { id: "done-today", dueDate: TODAY, title: "Done today", completed: true, priority: "medium", createdAt: "2025-01-01" },
  ];

  const selected = selectTodayTasks(tasks, { milestones, todayKey: TODAY });
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
