import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  calculateGoalProgress,
  detachMilestonesFromDeletedGoal,
  detachTasksFromDeletedGoal,
  selectGoalWork,
  updateMilestone,
} from "../src/domain/goals.ts";
import {
  calculateProjectProgress,
  detachGoalFromProjects,
} from "../src/domain/projects.ts";
import {
  alignMilestone,
  alignTask,
  detachHabitsFromDeletedGoal,
  propagateMilestoneMove,
} from "../src/domain/relationships.ts";
import { deleteTask, toggleTaskCompletion, updateTask } from "../src/domain/tasks.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSource = readFileSync(path.join(root, "src/App.tsx"), "utf8");

const goals = [
  { id: "goal-1", title: "G1", status: "active", createdAt: "2025-01-01" },
  { id: "goal-2", title: "G2", status: "active", createdAt: "2025-01-01" },
];
const projects = [
  { id: "p-a", goalId: "goal-1", name: "PA", status: "active", createdAt: "2025-01-01" },
  { id: "p-b", goalId: "goal-2", name: "PB", status: "active", createdAt: "2025-01-01" },
];

function goalProgress(goal, milestones, tasks) {
  return calculateGoalProgress(goal, milestones, tasks, undefined, undefined, undefined, projects);
}

function projectProgress(project, milestones, tasks) {
  return calculateProjectProgress(project, milestones, tasks);
}

// Same composition as App.handleEditMilestone: align the edited Milestone,
// then re-resolve its child Tasks against the updated list.
function editMilestone(milestones, tasks, milestoneId, data) {
  const existing = milestones.find((milestone) => milestone.id === milestoneId);
  const updated = alignMilestone(updateMilestone(existing, data), projects);
  const nextMilestones = milestones.map((milestone) =>
    milestone.id === milestoneId ? updated : milestone,
  );
  const nextTasks = (updated.projectId !== existing.projectId || updated.goalId !== existing.goalId)
    ? propagateMilestoneMove(tasks, updated, nextMilestones, projects)
    : tasks;
  return { nextMilestones, nextTasks };
}

// --- Moving a Milestone between Projects/Goals ---

test("moving a Milestone re-resolves its Tasks instead of leaving stale references", () => {
  const milestones = [{ id: "m-1", goalId: "goal-1", projectId: "p-a", title: "M", completed: false }];
  const tasks = [{
    id: "t-1", goalId: "goal-1", projectId: "p-a", milestoneId: "m-1",
    title: "T", completed: false, priority: "medium", createdAt: "2025-01-01",
  }];

  const { nextMilestones, nextTasks } = editMilestone(milestones, tasks, "m-1", {
    title: "M", goalId: "goal-1", projectId: "p-b",
  });

  assert.equal(nextTasks[0].projectId, "p-b");
  assert.equal(nextTasks[0].goalId, "goal-2");
  assert.equal(nextTasks[0].milestoneId, "m-1");
  assert.deepEqual(nextMilestones[0], { ...milestones[0], goalId: "goal-2", projectId: "p-b" });
});

test("a moved Milestone's Task counts under the new parents only, never both", () => {
  const milestones = [{ id: "m-1", goalId: "goal-1", projectId: "p-a", title: "M", completed: false }];
  const tasks = [{
    id: "t-1", goalId: "goal-1", projectId: "p-a", milestoneId: "m-1",
    title: "T", completed: false, priority: "medium", createdAt: "2025-01-01",
  }];

  const { nextMilestones, nextTasks } = editMilestone(milestones, tasks, "m-1", {
    title: "M", goalId: "goal-1", projectId: "p-b",
  });

  assert.deepEqual(selectGoalWork(goals[0], { projects, milestones: nextMilestones, tasks: nextTasks }).tasks, []);
  assert.deepEqual(
    selectGoalWork(goals[1], { projects, milestones: nextMilestones, tasks: nextTasks }).tasks.map((t) => t.id),
    ["t-1"],
  );
  assert.equal(goalProgress(goals[0], nextMilestones, nextTasks).total, 0);
  assert.equal(goalProgress(goals[1], nextMilestones, nextTasks).total, 2);
  assert.equal(projectProgress(projects[0], nextMilestones, nextTasks).total, 0);
  assert.equal(projectProgress(projects[1], nextMilestones, nextTasks).total, 2);
});

test("moving a Milestone out of all Projects keeps its Tasks' direct links", () => {
  const milestones = [{ id: "m-1", goalId: "goal-1", projectId: "p-a", title: "M", completed: false }];
  const tasks = [{
    id: "t-1", goalId: "goal-1", projectId: "p-a", milestoneId: "m-1",
    title: "T", completed: false, priority: "medium", createdAt: "2025-01-01",
  }];
  const other = {
    id: "t-2", title: "Unrelated", completed: false, priority: "low", createdAt: "2025-01-02",
  };

  const { nextMilestones, nextTasks } = editMilestone([milestones[0]], [tasks[0], other], "m-1", {
    title: "M", goalId: "goal-1", projectId: undefined,
  });

  // No inherited Project to resolve through: the Task's own links stand.
  assert.deepEqual(nextTasks[0], tasks[0]);
  assert.equal(nextTasks[1], other, "unrelated Tasks are returned untouched");
  assert.equal(nextMilestones[0].projectId, undefined);
});

test("a title-only Milestone edit leaves every Task untouched", () => {
  const milestones = [{ id: "m-1", goalId: "goal-1", projectId: "p-a", title: "M", completed: false }];
  const tasks = [{
    id: "t-1", goalId: "goal-1", projectId: "p-a", milestoneId: "m-1",
    title: "T", completed: false, priority: "medium", createdAt: "2025-01-01",
  }];

  const { nextTasks } = editMilestone(milestones, tasks, "m-1", {
    title: "Renamed", goalId: "goal-1", projectId: "p-a",
  });

  assert.equal(nextTasks, tasks, "no hierarchy change means no Task rewrite");
});

// --- Deleting a Goal detaches (keeps) its children ---

test("deleting a Goal detaches its Milestones and Tasks instead of deleting them", () => {
  const milestones = [
    { id: "m-1", goalId: "goal-1", projectId: "p-a", title: "In project", completed: true },
    { id: "m-2", goalId: "goal-1", title: "Direct", completed: false },
    { id: "m-3", goalId: "goal-2", title: "Other goal", completed: false },
  ];
  const tasks = [
    {
      id: "t-1", goalId: "goal-1", projectId: "p-a", milestoneId: "m-1",
      title: "Via chain", completed: true, priority: "medium", createdAt: "2025-01-01",
    },
    {
      id: "t-2", goalId: "goal-1", title: "Direct", completed: false,
      priority: "medium", createdAt: "2025-01-01",
    },
    {
      id: "t-3", goalId: "goal-2", title: "Other goal", completed: false,
      priority: "medium", createdAt: "2025-01-01",
    },
  ];

  const nextMilestones = detachMilestonesFromDeletedGoal(milestones, "goal-1");
  const nextTasks = detachTasksFromDeletedGoal(tasks, "goal-1");

  assert.equal(nextMilestones.length, 3, "no Milestone is deleted");
  assert.equal(nextTasks.length, 3, "no Task is deleted");
  assert.equal(nextMilestones[0].goalId, undefined);
  assert.equal(nextMilestones[0].projectId, "p-a", "surviving Project link is kept");
  assert.equal(nextMilestones[1].goalId, undefined);
  assert.equal(nextMilestones[2], milestones[2]);
  assert.equal(nextTasks[0].goalId, undefined);
  assert.equal(nextTasks[0].projectId, "p-a", "surviving Project link is kept");
  assert.equal(nextTasks[0].milestoneId, "m-1", "surviving Milestone link is kept");
  assert.equal(nextTasks[1].goalId, undefined);
  assert.equal(nextTasks[2], tasks[2]);
});

test("detached children leave no stale references and stay counted by surviving parents", () => {
  const milestones = [
    { id: "m-1", goalId: "goal-1", projectId: "p-a", title: "In project", completed: true },
  ];
  const tasks = [
    {
      id: "t-1", goalId: "goal-1", projectId: "p-a", milestoneId: "m-1",
      title: "Via chain", completed: true, priority: "medium", createdAt: "2025-01-01",
    },
  ];

  const nextMilestones = detachMilestonesFromDeletedGoal(milestones, "goal-1");
  const nextTasks = detachTasksFromDeletedGoal(tasks, "goal-1");
  const nextProjects = detachGoalFromProjects(projects, "goal-1");

  const goalIds = new Set(["goal-2"]);
  const projectIds = new Set(nextProjects.map((p) => p.id));
  const milestoneIds = new Set(nextMilestones.map((m) => m.id));
  for (const task of nextTasks) {
    if (task.goalId !== undefined) assert.ok(goalIds.has(task.goalId), "no dangling task goalId");
    if (task.projectId !== undefined) assert.ok(projectIds.has(task.projectId), "no dangling task projectId");
    if (task.milestoneId !== undefined) assert.ok(milestoneIds.has(task.milestoneId), "no dangling task milestoneId");
  }

  // The surviving Project still owns the Milestone and the Task: its
  // progress is unchanged by the Goal deletion.
  const progress = projectProgress(nextProjects[0], nextMilestones, nextTasks);
  assert.equal(progress.total, 2);
  assert.equal(progress.completed, 2);
  assert.equal(progress.percent, 100);
});

// --- Task lifecycle updates Goal and Project progress ---

test("completing, uncompleting, editing, and deleting a Task update both progress values", () => {
  const milestones = [{ id: "m-1", goalId: "goal-1", projectId: "p-a", title: "M", completed: false }];
  const tasks = [
    {
      id: "t-1", goalId: "goal-1", projectId: "p-a", title: "One",
      completed: false, priority: "medium", createdAt: "2025-01-01",
    },
    {
      id: "t-2", goalId: "goal-1", projectId: "p-a", milestoneId: "m-1", title: "Two",
      completed: false, priority: "medium", createdAt: "2025-01-02",
    },
  ];

  assert.equal(goalProgress(goals[0], milestones, tasks).completed, 0);
  assert.equal(projectProgress(projects[0], milestones, tasks).completed, 0);

  const done = tasks.map((task) => task.id === "t-1" ? toggleTaskCompletion(task) : task);
  assert.equal(goalProgress(goals[0], milestones, done).completed, 1);
  assert.equal(projectProgress(projects[0], milestones, done).completed, 1);

  const reopened = done.map((task) => task.id === "t-1" ? toggleTaskCompletion(task) : task);
  assert.equal(goalProgress(goals[0], milestones, reopened).completed, 0);
  assert.equal(projectProgress(projects[0], milestones, reopened).completed, 0);

  const edited = reopened.map((task) => task.id === "t-2"
    ? { ...task, completed: true }
    : task);
  assert.equal(goalProgress(goals[0], milestones, edited).completed, 1);

  const afterDelete = deleteTask(edited, "t-1");
  assert.equal(goalProgress(goals[0], milestones, afterDelete).total, 2);
  assert.equal(projectProgress(projects[0], milestones, afterDelete).total, 2);
});

test("editing a Task preserves completion and re-resolves moved Milestone links", () => {
  const milestones = [
    { id: "m-1", goalId: "goal-1", projectId: "p-a", title: "M1", completed: false },
    { id: "m-2", goalId: "goal-2", projectId: "p-b", title: "M2", completed: false },
  ];
  const task = {
    id: "t-1", goalId: "goal-1", projectId: "p-a", milestoneId: "m-1", title: "T",
    completed: true, priority: "medium", createdAt: "2025-01-01",
  };

  // Same composition as App.handleEditTask: update, then align.
  const moved = alignTask(updateTask(task, {
    title: "T", priority: "medium", dueDate: undefined, estimatedMinutes: undefined,
    scheduledTime: undefined, durationMinutes: undefined,
    goalId: "goal-1", projectId: "p-a", milestoneId: "m-2",
  }), milestones, projects);
  assert.equal(moved.completed, true, "editing preserves completion");
  assert.equal(moved.projectId, "p-b", "task inherits the new Milestone's Project");
  assert.equal(moved.goalId, "goal-2", "task inherits the new Milestone's Goal");
  assert.equal(goalProgress(goals[1], milestones, [moved]).total, 2);
});

// --- Habits linked to Goals keep working ---

test("Goal deletion keeps linked Habits intact and working", () => {
  const habits = [
    {
      id: 1, name: "Linked", goalId: "goal-1", priority: "Optional",
      type: "Daily", completedDates: ["2025-05-14"],
    },
    {
      id: 2, name: "Other", goalId: "goal-2", priority: "Optional",
      type: "Daily", completedDates: [],
    },
  ];

  const next = detachHabitsFromDeletedGoal(habits, "goal-1");

  assert.deepEqual(next[0], { ...habits[0], goalId: undefined });
  assert.equal(next[1], habits[1]);
  assert.deepEqual(next[0].completedDates, ["2025-05-14"], "completion history is preserved");
});

test("an empty Goal and an empty Project report zero progress", () => {
  const goalProgressEmpty = goalProgress(goals[0], [], []);
  assert.equal(goalProgressEmpty.total, 0);
  assert.equal(goalProgressEmpty.completed, 0);
  assert.equal(goalProgressEmpty.percent, 0);

  const projectProgressEmpty = projectProgress(projects[0], [], []);
  assert.equal(projectProgressEmpty.total, 0);
  assert.equal(projectProgressEmpty.completed, 0);
  assert.equal(projectProgressEmpty.percent, 0);
});

// --- Wiring: App uses the centralized helpers, never ad-hoc deletes ---

test("App deletes a Goal by detaching children, never cascade-deleting Tasks or Milestones", () => {
  const block = appSource.match(/onDeleteGoal=\{\(goalId\) => \{[\s\S]*?\n              \}\}/);
  assert.ok(block, "App must define onDeleteGoal");
  assert.ok(block[0].includes("detachMilestonesFromDeletedGoal"), "milestones are detached");
  assert.ok(block[0].includes("detachTasksFromDeletedGoal"), "tasks are detached");
  assert.ok(!block[0].includes("current.filter((task)"), "tasks are not filtered out on Goal delete");
  assert.ok(!block[0].includes("current.filter((milestone)"), "milestones are not filtered out on Goal delete");
});

test("App re-resolves child Tasks when a Milestone's hierarchy changes", () => {
  const handler = appSource.match(/function handleEditMilestone[\s\S]*?\n  \}/);
  assert.ok(handler, "App must define handleEditMilestone");
  assert.ok(handler[0].includes("propagateMilestoneMove"), "child Tasks follow Milestone moves");
});
