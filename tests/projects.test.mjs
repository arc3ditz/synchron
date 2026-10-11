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
  determineProjectStatus,
  recalculateProjectStatuses,
  updateProject,
  updateProjectArchive,
} from "../src/domain/projects.ts";
import { loadProjects, STORAGE_KEYS } from "../src/utils/storage.ts";
import { alignProject } from "../src/domain/relationships.ts";

const baseProject = {
  name: "Ship landing page",
  description: "Marketing site refresh",
  startDate: "2025-02-01",
  targetDate: "2025-03-01",
};

test("createProject defaults to active status and works without a Goal", () => {
  const project = createProject({ ...baseProject });

  assert.equal(project.status, "active");
  assert.equal(project.goalId, undefined);
  assert.equal(project.name, baseProject.name);
  assert.equal(typeof project.id, "string");
  assert.equal(typeof project.createdAt, "string");
});

test("createProject preserves a legacy goalId when present", () => {
  const project = createProject({ ...baseProject, goalId: "legacy-goal" });

  assert.equal(project.goalId, "legacy-goal");
  assert.equal(project.status, "active");
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

test("project lifecycle derives completion, date-based archival, and manual archive overrides", () => {
  const project = createProject({ name: "Lifecycle", targetDate: "2026-10-08" });
  const milestones = [{ id: "m-1", projectId: project.id, title: "Milestone", completed: true }];
  const tasks = [{ id: "t-1", projectId: project.id, title: "Task", completed: true, priority: "medium", createdAt: "2026-01-01" }];

  assert.equal(determineProjectStatus(project, milestones, tasks, "2026-10-09"), "archived");
  assert.equal(determineProjectStatus({ ...project, targetDate: undefined }, milestones, tasks, "2026-10-09"), "completed");
  assert.equal(determineProjectStatus({ ...project, targetDate: "2026-10-09" }, milestones, tasks, "2026-10-09"), "completed");

  const manuallyArchived = updateProjectArchive(project, true);
  assert.equal(determineProjectStatus(manuallyArchived, [], [], "2026-10-09"), "archived");

  const unarchived = updateProjectArchive(manuallyArchived, false);
  assert.equal(determineProjectStatus(unarchived, [], [], "2026-10-09"), "active");
  assert.equal(determineProjectStatus(
    updateProjectArchive({ ...project, status: "archived" }, false),
    milestones,
    tasks,
    "2026-10-09",
  ), "completed");
});

test("reopening work reverses automatic archival but not an intentional archive", () => {
  const project = createProject({ name: "Reopen", targetDate: "2026-10-08" });
  const milestone = { id: "m-1", projectId: project.id, title: "Milestone", completed: true };
  const completedTask = { id: "t-1", projectId: project.id, title: "Task", completed: true, priority: "medium", createdAt: "2026-01-01" };
  const reopenedTask = { ...completedTask, completed: false };

  assert.equal(recalculateProjectStatuses([project], [milestone], [completedTask], "2026-10-09")[0].status, "archived");
  assert.equal(recalculateProjectStatuses([project], [milestone], [reopenedTask], "2026-10-09")[0].status, "active");
  assert.equal(recalculateProjectStatuses(
    [updateProjectArchive(project, true)],
    [milestone],
    [reopenedTask],
    "2026-10-09",
  )[0].status, "archived");
});

test("empty projects remain active even when their target date has passed", () => {
  const project = createProject({ name: "Empty", targetDate: "2026-10-08" });

  assert.equal(determineProjectStatus(project, [], [], "2026-10-09"), "active");
  assert.equal(determineProjectStatus({ ...project, status: "completed" }, [], [], "2026-10-09"), "active");
});

test("legacy Planned projects load as active and legacy archived projects stay archived", () => {
  const previousStorage = globalThis.localStorage;
  const stored = [
    { id: "legacy-planned", name: "Legacy planned", status: "planned", createdAt: "2025-01-01" },
    { id: "legacy-archived", name: "Legacy archived", status: "archived", createdAt: "2025-01-01" },
  ];
  globalThis.localStorage = {
    getItem: (key) => key === STORAGE_KEYS.PROJECTS ? JSON.stringify(stored) : null,
    setItem: () => {},
    removeItem: () => {},
  };
  try {
    const projects = loadProjects();
    assert.equal(projects[0].status, "active");
    assert.equal(projects[1].status, "archived");
    assert.equal(projects[1].archiveOverride, "archived");
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
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
  assert.equal(projects[0].status, "active");
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
  assert.equal(project.status, "active");
});
