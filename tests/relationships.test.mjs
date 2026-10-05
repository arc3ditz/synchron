import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRelationships } from "../src/domain/relationships.ts";

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
