import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateProjectProgress,
  createProject,
  deleteProject,
  detachMilestonesFromDeletedProject,
  detachTasksFromDeletedProject,
  disassociateProjectFocusSessions,
  filterMilestonesByProject,
  filterTasksByProject,
  updateProject,
  updateProjectStatus,
} from "../src/domain/projects.ts";
import { alignProject } from "../src/domain/relationships.ts";

const baseProject = {
  name: "Ship landing page",
  description: "Marketing site refresh",
  startDate: "2025-02-01",
  targetDate: "2025-03-01",
};

test("createProject defaults to planned status and works without a Goal", () => {
  const project = createProject({ ...baseProject });

  assert.equal(project.status, "planned");
  assert.equal(project.goalId, undefined);
  assert.equal(project.name, baseProject.name);
  assert.equal(typeof project.id, "string");
  assert.equal(typeof project.createdAt, "string");
});

test("createProject preserves a legacy goalId when present", () => {
  const project = createProject({ ...baseProject, goalId: "legacy-goal" });

  assert.equal(project.goalId, "legacy-goal");
  assert.equal(project.status, "planned");
});

test("updateProject edits fields but preserves identity and status", () => {
  const project = createProject({ ...baseProject });
  const updated = updateProject(project, {
    name: "Renamed",
    description: undefined,
    startDate: undefined,
    targetDate: "2025-04-01",
  });

  assert.equal(updated.id, project.id);
  assert.equal(updated.createdAt, project.createdAt);
  assert.equal(updated.status, project.status);
  assert.equal(updated.name, "Renamed");
  assert.equal(updated.goalId, undefined);
  assert.equal(updated.targetDate, "2025-04-01");
});

test("updateProjectStatus only changes the status", () => {
  const project = createProject({ ...baseProject });
  const activated = updateProjectStatus(project, "active");

  assert.equal(activated.status, "active");
  assert.equal(activated.name, project.name);
  assert.equal(updateProjectStatus(activated, "archived").status, "archived");
});

test("deleteProject removes only the targeted project", () => {
  const first = createProject({ ...baseProject });
  const second = createProject({ ...baseProject, name: "Other" });

  assert.deepEqual(deleteProject([first, second], first.id), [second]);
});

test("deleting a project detaches its Milestones without deleting them", () => {
  const project = createProject({ ...baseProject });
  const milestones = [
    { id: "m-1", projectId: project.id, title: "Belongs to project", completed: false },
    { id: "m-2", projectId: project.id, title: "Also belongs", completed: false },
    { id: "m-3", projectId: "other-project", title: "Untouched", completed: false },
  ];

  assert.deepEqual(detachMilestonesFromDeletedProject(milestones, project), [
    { ...milestones[0], projectId: undefined },
    { ...milestones[1], projectId: undefined },
    milestones[2],
  ]);
});

test("deleting a project detaches its Tasks without deleting them", () => {
  const project = createProject({ ...baseProject });
  const tasks = [
    { id: "t-1", projectId: project.id, title: "Belongs to project", completed: false, priority: "medium", createdAt: "2025-01-01" },
    { id: "t-2", projectId: project.id, title: "Also belongs", completed: false, priority: "high", createdAt: "2025-01-01" },
    { id: "t-3", projectId: "other-project", title: "Untouched", completed: false, priority: "low", createdAt: "2025-01-01" },
  ];

  assert.deepEqual(detachTasksFromDeletedProject(tasks, project), [
    { ...tasks[0], projectId: undefined },
    { ...tasks[1], projectId: undefined },
    tasks[2],
  ]);
});

test("projects work standalone without any Goal link", () => {
  const projects = [
    createProject({ ...baseProject }),
    createProject({ ...baseProject, name: "Second" }),
  ];

  assert.equal(projects[0].goalId, undefined);
  assert.equal(projects[0].status, "planned");
  assert.equal(projects[1].name, "Second");
});

test("deleting a project disassociates its Focus Sessions without dropping child links", () => {
  const sessions = [
    { id: 1, timestamp: 1, sessionType: "Timer", durationMinutes: 20, habitName: "One", projectId: "project-1" },
    { id: 2, timestamp: 2, sessionType: "Timer", durationMinutes: 20, habitName: "Two", projectId: "project-2" },
    { id: 3, timestamp: 3, sessionType: "Timer", durationMinutes: 20, habitName: "Three", milestoneId: "m-1" },
  ];

  const result = disassociateProjectFocusSessions(sessions, "project-1", new Set(), new Set());

  assert.equal(result[0].projectId, undefined);
  assert.equal(result[1].projectId, "project-2");
  assert.deepEqual(result[2], sessions[2]);
});

test("a Project without Milestones or Tasks has zero progress", () => {
  const project = createProject({ ...baseProject });
  const progress = calculateProjectProgress(project, [], []);

  assert.equal(progress.percent, 0);
  assert.equal(progress.total, 0);
  assert.equal(progress.taskPercent, 0);
  assert.equal(progress.milestonePercent, 0);
});

test("Project progress rolls up Tasks and Milestones only", () => {
  const project = createProject({ ...baseProject });
  const milestones = [
    { id: "m-1", projectId: project.id, title: "Done", completed: true },
    { id: "m-2", projectId: project.id, title: "Open", completed: false },
    { id: "m-3", title: "Other project", completed: false },
  ];
  const tasks = [
    { id: "t-1", projectId: project.id, title: "Done", completed: true, priority: "medium", createdAt: "2025-01-01" },
    { id: "t-2", projectId: project.id, title: "Open", completed: false, priority: "medium", createdAt: "2025-01-01" },
    { id: "t-3", title: "Unrelated", completed: true, priority: "medium", createdAt: "2025-01-01" },
  ];

  const progress = calculateProjectProgress(project, milestones, tasks);

  assert.equal(progress.total, 4);
  assert.equal(progress.completed, 2);
  assert.equal(progress.percent, 50);
  assert.equal(progress.taskTotal, 2);
  assert.equal(progress.taskCompleted, 1);
  assert.equal(progress.taskPercent, 50);
  assert.equal(progress.milestoneTotal, 2);
  assert.equal(progress.milestoneCompleted, 1);
  assert.equal(progress.milestonePercent, 50);
});

test("Tasks under a Project's Milestone count toward the Project without their own projectId", () => {
  const project = createProject({ ...baseProject });
  const milestones = [{ id: "m-1", projectId: project.id, title: "Milestone", completed: false }];
  const tasks = [
    { id: "t-1", milestoneId: "m-1", title: "Via milestone", completed: true, priority: "medium", createdAt: "2025-01-01" },
  ];

  const progress = calculateProjectProgress(project, milestones, tasks);

  assert.equal(progress.total, 2);
  assert.equal(progress.completed, 1);
  assert.equal(progress.percent, 50);
  assert.equal(progress.taskTotal, 1);
});

test("filter helpers scope Projects, Milestones, and Tasks to a Project", () => {
  const projects = [
    createProject({ ...baseProject }),
    createProject({ ...baseProject, name: "Standalone" }),
  ];
  const milestones = [
    { id: "m-1", projectId: projects[0].id, title: "One", completed: false },
    { id: "m-2", title: "Two", completed: false },
  ];
  const tasks = [
    { id: "t-1", projectId: projects[0].id, title: "One", completed: false, priority: "medium", createdAt: "2025-01-01" },
    { id: "t-2", title: "Two", completed: false, priority: "medium", createdAt: "2025-01-01" },
  ];

  assert.deepEqual(filterMilestonesByProject(milestones, projects[0].id), [milestones[0]]);
  assert.deepEqual(filterTasksByProject(tasks, projects[0].id), [tasks[0]]);
});

test("deleting a project clears the deleted reference from Tasks under its Milestones", () => {
  const project = createProject({ ...baseProject });
  const milestones = [
    { id: "m-1", projectId: project.id, title: "Belongs to project", completed: false },
  ];
  const tasks = [
    // No direct Project link: reachable only through the deleted Project's Milestone.
    { id: "t-1", milestoneId: "m-1", title: "Via milestone only", completed: false, priority: "medium", createdAt: "2025-01-01" },
    // Both direct and indirect links to the deleted Project.
    { id: "t-2", projectId: project.id, milestoneId: "m-1", title: "Direct and via milestone", completed: true, priority: "medium", createdAt: "2025-01-01" },
    // Direct Project Task without a Milestone (existing behavior preserved).
    { id: "t-3", projectId: project.id, title: "Direct only", completed: false, priority: "medium", createdAt: "2025-01-01" },
    { id: "t-4", projectId: "other-project", title: "Untouched", completed: false, priority: "low", createdAt: "2025-01-01" },
  ];

  const detachedMilestones = detachMilestonesFromDeletedProject(milestones, project);
  const detachedTasks = detachTasksFromDeletedProject(tasks, project, milestones);

  // Nothing is deleted; Milestones survive with projectId cleared.
  assert.equal(detachedMilestones.length, 1);
  assert.equal(detachedMilestones[0].projectId, undefined);
  assert.equal(detachedTasks.length, 4);
  // No Task keeps a reference to the deleted Project.
  for (const task of detachedTasks) {
    assert.notEqual(task.projectId, project.id);
  }
  assert.equal(detachedTasks[0].milestoneId, "m-1");
  assert.equal(detachedTasks[1].projectId, undefined);
  assert.equal(detachedTasks[1].milestoneId, "m-1");
  assert.equal(detachedTasks[2].projectId, undefined);
  assert.equal(detachedTasks[3], tasks[3]);
});

test("a Project is created standalone through the shared creation path", () => {
  // Same composition as App.handleAddProject: existing creation logic only.
  const project = alignProject(createProject({ name: "Run a 5K" }));

  assert.equal(project.goalId, undefined);
  assert.equal(project.name, "Run a 5K");
  assert.equal(project.status, "planned");
});
