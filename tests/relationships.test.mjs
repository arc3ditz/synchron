import assert from "node:assert/strict";
import test from "node:test";
import {
  alignMilestone,
  alignTask,
  normalizeRelationships,
  propagateMilestoneMove,
} from "../src/domain/relationships.ts";

const project = { id: "project-1", name: "P", status: "active", createdAt: "2025-01-01" };

test("valid relationships are preserved", () => {
  const milestones = [{ id: "m-1", projectId: "project-1", title: "M", completed: false }];
  const tasks = [{ id: "t-1", projectId: "project-1", milestoneId: "m-1", title: "T", completed: false, priority: "medium", createdAt: "2025-01-01" }];

  const result = normalizeRelationships([project], milestones, tasks);

  assert.deepEqual(result.projects, [project]);
  assert.deepEqual(result.milestones, milestones);
  assert.deepEqual(result.tasks, tasks);
});

test("legacy overload with goals argument preserves goalId verbatim", () => {
  const goal = { id: "goal-1", title: "G", status: "active", createdAt: "2025-01-01" };
  const milestones = [{ id: "m-1", goalId: "goal-1", title: "M", completed: false }];
  const tasks = [{ id: "t-1", goalId: "goal-1", title: "T", completed: false, priority: "medium", createdAt: "2025-01-01" }];

  const result = normalizeRelationships([goal], [], milestones, tasks);

  assert.equal(result.milestones[0].goalId, "goal-1");
  assert.equal(result.tasks[0].goalId, "goal-1");
});

test("dangling project/milestone references are detached, not deleted; legacy goalId preserved", () => {
  const projects = [
    { id: "p-x", goalId: "legacy-goal", name: "P", status: "active", createdAt: "2025-01-01" },
  ];
  const milestones = [
    { id: "m-1", goalId: "legacy-goal", projectId: "missing-project", title: "M", completed: false },
  ];
  const tasks = [
    { id: "t-1", goalId: "legacy-goal", projectId: "missing-project", milestoneId: "missing-milestone", title: "T", completed: false, priority: "medium", createdAt: "2025-01-01" },
  ];

  const result = normalizeRelationships(projects, milestones, tasks);

  assert.equal(result.projects.length, 1);
  assert.equal(result.projects[0].goalId, "legacy-goal");
  assert.equal(result.milestones[0].projectId, undefined);
  assert.equal(result.milestones[0].goalId, "legacy-goal");
  assert.equal(result.tasks[0].milestoneId, undefined);
  assert.equal(result.tasks[0].projectId, undefined);
  assert.equal(result.tasks[0].goalId, "legacy-goal");
  assert.equal(result.milestones.length, 1);
  assert.equal(result.tasks.length, 1);
});

test("task project is aligned with its milestone's project", () => {
  const project2 = { id: "project-2", name: "P2", status: "active", createdAt: "2025-01-01" };
  const milestones = [{ id: "m-1", projectId: "project-1", title: "M", completed: false }];
  const tasks = [{ id: "t-1", projectId: "project-2", milestoneId: "m-1", title: "T", completed: false, priority: "medium", createdAt: "2025-01-01" }];

  const result = normalizeRelationships([project, project2], milestones, tasks);

  assert.equal(result.tasks[0].projectId, "project-1");
});

test("independent entities pass through unchanged", () => {
  const milestones = [{ id: "m-1", title: "Free", completed: false }];
  const tasks = [{ id: "t-1", title: "Free", completed: false, priority: "medium", createdAt: "2025-01-01" }];

  const result = normalizeRelationships([], milestones, tasks);

  assert.deepEqual(result.milestones, milestones);
  assert.deepEqual(result.tasks, tasks);
});

test("alignMilestone preserves the milestone when its project exists", () => {
  const projects = [
    { id: "project-a", name: "PA", status: "active", createdAt: "2025-01-01" },
  ];
  const withProject = { id: "m-1", goalId: "legacy", projectId: "project-a", title: "M", completed: false };

  assert.deepEqual(alignMilestone(withProject, projects), withProject);

  const independent = { id: "m-2", title: "Free", completed: false };
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

test("propagateMilestoneMove re-resolves child tasks through the moved milestone", () => {
  const milestones = [{ id: "m-1", projectId: "project-a", title: "M", completed: false }];
  const projects = [
    { id: "project-a", name: "PA", status: "active", createdAt: "2025-01-01" },
    { id: "project-b", name: "PB", status: "active", createdAt: "2025-01-01" },
  ];
  const tasks = [
    { id: "t-1", projectId: "project-b", milestoneId: "m-1", title: "Child", completed: false, priority: "medium", createdAt: "2025-01-01" },
  ];

  const result = propagateMilestoneMove(tasks, { id: "m-1", projectId: "project-a" }, milestones, projects);
  assert.equal(result[0].projectId, "project-a");
  assert.equal(result[0].milestoneId, "m-1");
});

test("Task under a Milestone in a Project resolves its Project through it", () => {
  const projects = [
    { id: "project-1", name: "P", status: "active", createdAt: "2025-01-01" },
  ];
  const milestones = [
    { id: "m-1", projectId: "project-1", title: "M", completed: false },
  ];
  const tasks = [
    { id: "t-1", goalId: "legacy", milestoneId: "m-1", title: "Legacy goal preserved", completed: false, priority: "medium", createdAt: "2025-01-01" },
    { id: "t-2", title: "Independent", completed: false, priority: "medium", createdAt: "2025-01-01" },
  ];

  const result = normalizeRelationships(projects, milestones, tasks);

  assert.equal(result.tasks[0].projectId, "project-1");
  assert.equal(result.tasks[0].goalId, "legacy");
  assert.equal(result.tasks[0].milestoneId, "m-1");
  assert.equal(result.tasks[1], tasks[1]);
});
