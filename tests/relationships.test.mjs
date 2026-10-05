import assert from "node:assert/strict";
import test from "node:test";
import {
  alignMilestone,
  alignTask,
  detachHabitsFromDeletedGoal,
  normalizeRelationships,
  propagateProjectGoalChange,
} from "../src/domain/relationships.ts";

const goal = { id: "goal-1", title: "Goal", status: "active", createdAt: "2025-01-01" };
const project = { id: "project-1", goalId: "goal-1", name: "P", status: "active", createdAt: "2025-01-01" };

test("valid relationships are preserved", () => {
  const milestones = [{ id: "m-1", goalId: "goal-1", projectId: "project-1", title: "M", completed: false }];
  const tasks = [{ id: "t-1", goalId: "goal-1", projectId: "project-1", milestoneId: "m-1", title: "T", completed: false, priority: "medium", createdAt: "2025-01-01" }];

  const result = normalizeRelationships([goal], [project], milestones, tasks);

  assert.deepEqual(result.projects, [project]);
  assert.deepEqual(result.milestones, milestones);
  assert.deepEqual(result.tasks, tasks);
});

test("dangling references are detached, not deleted", () => {
  const projects = [
    { id: "p-x", goalId: "missing-goal", name: "P", status: "active", createdAt: "2025-01-01" },
  ];
  const milestones = [
    { id: "m-1", goalId: "missing-goal", projectId: "missing-project", title: "M", completed: false },
  ];
  const tasks = [
    { id: "t-1", goalId: "missing-goal", projectId: "missing-project", milestoneId: "missing-milestone", title: "T", completed: false, priority: "medium", createdAt: "2025-01-01" },
  ];

  const result = normalizeRelationships([goal], projects, milestones, tasks);

  assert.equal(result.projects[0].goalId, undefined);
  assert.equal(result.milestones[0].projectId, undefined);
  assert.equal(result.milestones[0].goalId, undefined);
  assert.equal(result.tasks[0].milestoneId, undefined);
  assert.equal(result.tasks[0].projectId, undefined);
  assert.equal(result.tasks[0].goalId, undefined);
  assert.equal(result.projects.length, 1);
  assert.equal(result.milestones.length, 1);
  assert.equal(result.tasks.length, 1);
});

test("milestone with a project is made consistent with that project's goal", () => {
  const milestones = [{ id: "m-1", goalId: "other-goal", projectId: "project-1", title: "M", completed: false }];
  const result = normalizeRelationships([goal, { ...goal, id: "other-goal" }], [project], milestones, []);
  assert.equal(result.milestones[0].goalId, "goal-1");
});

test("task project is aligned with its milestone's project", () => {
  const project2 = { id: "project-2", name: "P2", status: "active", createdAt: "2025-01-01" };
  const milestones = [{ id: "m-1", projectId: "project-1", title: "M", completed: false }];
  const tasks = [{ id: "t-1", projectId: "project-2", milestoneId: "m-1", title: "T", completed: false, priority: "medium", createdAt: "2025-01-01" }];

  const result = normalizeRelationships([goal], [project, project2], milestones, tasks);

  assert.equal(result.tasks[0].projectId, "project-1");
});

test("independent entities pass through unchanged", () => {
  const milestones = [{ id: "m-1", title: "Free", completed: false }];
  const tasks = [{ id: "t-1", title: "Free", completed: false, priority: "medium", createdAt: "2025-01-01" }];

  const result = normalizeRelationships([goal], [], milestones, tasks);

  assert.deepEqual(result.milestones, milestones);
  assert.deepEqual(result.tasks, tasks);
});

test("changing a Project from Goal A to Goal B updates child relationships immediately", () => {
  const project = { id: "project-1", goalId: "goal-b", name: "P", status: "active", createdAt: "2025-01-01" };
  const milestones = [
    { id: "m-1", goalId: "goal-a", projectId: "project-1", title: "M", completed: false },
    { id: "m-2", goalId: "goal-a", title: "Unrelated", completed: false },
  ];
  const tasks = [
    { id: "t-1", goalId: "goal-a", projectId: "project-1", title: "Direct", completed: false, priority: "medium", createdAt: "2025-01-01" },
    { id: "t-2", goalId: "goal-a", milestoneId: "m-1", title: "Via milestone", completed: false, priority: "medium", createdAt: "2025-01-01" },
    { id: "t-3", goalId: "goal-a", title: "Unrelated", completed: false, priority: "medium", createdAt: "2025-01-01" },
  ];

  const result = propagateProjectGoalChange(milestones, tasks, project);

  assert.equal(result.milestones[0].goalId, "goal-b");
  assert.equal(result.milestones[1], milestones[1]);
  assert.equal(result.tasks[0].goalId, "goal-b");
  assert.equal(result.tasks[1].goalId, "goal-b");
  assert.equal(result.tasks[1].projectId, "project-1");
  assert.equal(result.tasks[2], tasks[2]);
  // Nothing is deleted.
  assert.equal(result.milestones.length, 2);
  assert.equal(result.tasks.length, 3);
});

test("changing a Project to no Goal clears inherited child Goal relationships", () => {
  const project = { id: "project-1", name: "P", status: "active", createdAt: "2025-01-01" };
  const milestones = [
    { id: "m-1", goalId: "goal-a", projectId: "project-1", title: "M", completed: false },
  ];
  const tasks = [
    { id: "t-1", goalId: "goal-a", projectId: "project-1", title: "T", completed: false, priority: "medium", createdAt: "2025-01-01" },
  ];

  const result = propagateProjectGoalChange(milestones, tasks, project);

  assert.equal(result.milestones[0].goalId, undefined);
  assert.equal(result.milestones[0].projectId, "project-1");
  assert.equal(result.tasks[0].goalId, undefined);
  assert.equal(result.tasks[0].projectId, "project-1");
});

test("alignMilestone resolves a Milestone to its Project's Goal", () => {
  const projects = [
    { id: "project-a", goalId: "goal-a", name: "PA", status: "active", createdAt: "2025-01-01" },
  ];
  const contradictory = { id: "m-1", goalId: "goal-b", projectId: "project-a", title: "M", completed: false };

  assert.equal(alignMilestone(contradictory, projects).goalId, "goal-a");

  const independent = { id: "m-2", goalId: "goal-b", title: "Free", completed: false };
  assert.equal(alignMilestone(independent, projects), independent);
});

test("alignTask keeps a Task's Project consistent with its Milestone", () => {
  const milestones = [{ id: "m-1", projectId: "project-a", title: "M", completed: false }];
  const projects = [{ id: "project-a", name: "PA", status: "active", createdAt: "2025-01-01" }];
  const contradictory = { id: "t-1", projectId: "project-b", milestoneId: "m-1", title: "T", completed: false, priority: "medium", createdAt: "2025-01-01" };

  assert.equal(alignTask(contradictory, milestones, projects).projectId, "project-a");

  const independent = { id: "t-2", title: "Free", completed: false, priority: "medium", createdAt: "2025-01-01" };
  assert.equal(alignTask(independent, milestones, projects), independent);
});

test("deleting a Goal detaches linked Habits without deleting them", () => {
  const habits = [
    { id: 1, name: "Linked", goalId: "goal-1", priority: "Optional", type: "Daily", completedDates: [] },
    { id: 2, name: "Unrelated", goalId: "goal-2", priority: "Optional", type: "Daily", completedDates: [] },
    { id: 3, name: "No goal", priority: "Optional", type: "Daily", completedDates: [] },
  ];

  const result = detachHabitsFromDeletedGoal(habits, "goal-1");

  assert.equal(result.length, 3);
  assert.equal(result[0].goalId, undefined);
  assert.equal(result[0].name, "Linked");
  assert.equal(result[1], habits[1]);
  assert.equal(result[2], habits[2]);
});

test("Task under a Milestone in a Project resolves Project and Goal through it", () => {
  const goals = [
    { id: "goal-a", title: "A", status: "active", createdAt: "2025-01-01" },
    { id: "goal-b", title: "B", status: "active", createdAt: "2025-01-01" },
  ];
  const projects = [
    { id: "project-1", goalId: "goal-b", name: "P", status: "active", createdAt: "2025-01-01" },
  ];
  const milestones = [
    { id: "m-1", projectId: "project-1", title: "M", completed: false },
  ];
  const tasks = [
    // Stale contradictory Goal from before the Milestone joined the Project.
    { id: "t-1", goalId: "goal-a", milestoneId: "m-1", title: "Stale goal", completed: false, priority: "medium", createdAt: "2025-01-01" },
    // Independent Task with its own Goal must remain unchanged.
    { id: "t-2", goalId: "goal-a", title: "Independent", completed: false, priority: "medium", createdAt: "2025-01-01" },
  ];

  const result = normalizeRelationships(goals, projects, milestones, tasks);

  assert.equal(result.tasks[0].projectId, "project-1");
  assert.equal(result.tasks[0].goalId, "goal-b");
  assert.equal(result.tasks[0].milestoneId, "m-1");
  assert.equal(result.tasks[1], tasks[1]);
});

test("Task under an independent Milestone with a Goal preserves that Goal", () => {
  const goals = [{ id: "goal-a", title: "A", status: "active", createdAt: "2025-01-01" }];
  const milestones = [{ id: "m-1", goalId: "goal-a", title: "M", completed: false }];
  const tasks = [
    { id: "t-1", milestoneId: "m-1", title: "Via milestone", completed: false, priority: "medium", createdAt: "2025-01-01" },
    { id: "t-2", title: "Fully independent", completed: false, priority: "medium", createdAt: "2025-01-01" },
  ];

  const result = normalizeRelationships(goals, [], milestones, tasks);

  assert.equal(result.tasks[0].goalId, "goal-a");
  assert.equal(result.tasks[0].projectId, undefined);
  assert.equal(result.tasks[1], tasks[1]);
});

test("alignTask resolves a contradictory Task Goal through its Milestone", () => {
  const milestones = [{ id: "m-1", goalId: "goal-b", projectId: "project-1", title: "M", completed: false }];
  const projects = [{ id: "project-1", goalId: "goal-b", name: "P", status: "active", createdAt: "2025-01-01" }];
  const contradictory = { id: "t-1", goalId: "goal-a", projectId: "project-1", milestoneId: "m-1", title: "T", completed: false, priority: "medium", createdAt: "2025-01-01" };

  const aligned = alignTask(contradictory, milestones, projects);

  assert.equal(aligned.goalId, "goal-b");
  assert.equal(aligned.projectId, "project-1");
  assert.equal(aligned.milestoneId, "m-1");
});
