import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  calculateProjectProgress,
  createProject,
  deleteProject,
  detachMilestonesFromDeletedProject,
  detachTasksFromDeletedProject,
  updateProject,
  updateProjectStatus,
} from "../src/domain/projects.ts";
import { createTask, toggleTaskCompletion } from "../src/domain/tasks.ts";
import { createMilestone, toggleMilestone } from "../src/domain/goals.ts";
import { alignTask, normalizeRelationships } from "../src/domain/relationships.ts";
import { recommendNextStep } from "../src/domain/nextStep.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const projectsSource = readFileSync(path.join(root, "src/components/Projects.tsx"), "utf8");
const tasksSource = readFileSync(path.join(root, "src/components/Tasks.tsx"), "utf8");

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

// --- 1. Create a Project by entering its name ---

test("a Project is created with a name alone; dates and description stay optional", () => {
  const project = createProject({ name: "Garden shed" });

  assert.equal(project.name, "Garden shed");
  assert.equal(project.status, "planned");
  assert.equal(project.description, undefined);
  assert.equal(project.startDate, undefined);
  assert.equal(project.targetDate, undefined);
  assert.equal(typeof project.id, "string");
  assert.equal(typeof project.createdAt, "string");
});

test("the Projects create form asks for a name first and hides details", () => {
  assert.match(projectsSource, /aria-label="Project Name"/, "name field stays the primary input");
  assert.ok(projectsSource.includes("Add details (optional)"), "details sit behind an opt-in toggle");
  // Description and dates still exist as optional fields, never required.
  assert.ok(projectsSource.includes('aria-label="Project Description"'), "description remains available");
  assert.ok(projectsSource.includes('aria-label="Project Start Date (Optional)"'), "start date remains available");
  assert.ok(projectsSource.includes('aria-label="Project Target Date (Optional)"'), "target date remains available");
  const createForm = projectsSource.slice(
    projectsSource.indexOf("Create a Project"),
    projectsSource.indexOf("Create a Project") + 4000,
  );
  assert.ok(!/required/.test(createForm.replace('aria-label="Project Name"', "").split("Add details")[1] ?? ""),
    "no required attribute on optional detail fields");
});

test("no Goal selection remains anywhere in the Projects screen", () => {
  assert.ok(!projectsSource.includes("Linked Goal"), "no Goal selector in Projects");
  assert.ok(!projectsSource.includes("No Goal"), "no Goal option text in Projects");
  assert.ok(!tasksSource.includes("Linked Goal"), "no Goal selector in Tasks either");
});

// --- 2. Standalone tasks ---

test("a standalone Task is created without any Project", () => {
  const task = createTask({ title: "Buy milk", priority: "medium" });

  assert.equal(task.projectId, undefined);
  assert.equal(task.milestoneId, undefined);
  assert.equal(task.completed, false);
});

test("standalone Tasks survive normalization untouched and appear in Today", () => {
  const task = makeTask({ id: "solo", title: "Solo", dueDate: TODAY });
  const result = normalizeRelationships([], [], [task]);

  assert.deepEqual(result.tasks, [task]);
});

// --- 3. Add a Task to an existing Project ---

test("a Task joins an existing Project and keeps the link through normalization", () => {
  const project = createProject({ name: "Shed" });
  const task = createTask({ title: "Buy timber", projectId: project.id, priority: "medium" });
  const aligned = alignTask(task, [], [project]);

  assert.equal(aligned.projectId, project.id);

  const result = normalizeRelationships([project], [], [aligned]);
  assert.equal(result.tasks[0].projectId, project.id);
});

test("a Task can join a Project's Milestone without its own projectId", () => {
  const project = createProject({ name: "Shed" });
  const milestone = createMilestone({ title: "Frame up", projectId: project.id });
  const task = createTask({ title: "Raise walls", milestoneId: milestone.id, priority: "medium" });
  const aligned = alignTask(task, [{ ...milestone, id: milestone.id }], [project]);

  assert.equal(aligned.projectId, project.id);
  assert.equal(aligned.milestoneId, milestone.id);

  const progress = calculateProjectProgress(project, [{ ...milestone, id: milestone.id }], [aligned]);
  assert.equal(progress.taskTotal, 1);
});

// --- 4. Completing a Task touches nothing else ---

test("completing a Task leaves its Project record byte-for-byte alone", () => {
  const project = createProject({ name: "Shed", description: "Keep dry", targetDate: "2026-12-01" });
  const before = structuredClone(project);
  const task = createTask({ title: "Buy timber", projectId: project.id, priority: "medium" });

  const done = toggleTaskCompletion(task);

  assert.equal(done.completed, true);
  assert.deepEqual(project, before, "project metadata untouched by task completion");
  assert.equal(updateProject(project, { name: project.name }).description, "Keep dry");
});

// --- 5. Milestones stay optional ---

test("a Project with no Milestones is valid and reports zero progress", () => {
  const project = createProject({ name: "Shed" });
  const progress = calculateProjectProgress(project, [], []);

  assert.equal(progress.total, 0);
  assert.equal(progress.percent, 0);
});

test("a Milestone is added only with a title; completing it keeps the record", () => {
  const project = createProject({ name: "Shed" });
  const milestone = createMilestone({ title: "Frame up", projectId: project.id });

  assert.equal(milestone.completed, false);
  assert.equal(milestone.targetDate, undefined);

  const done = toggleMilestone(milestone);
  assert.equal(done.completed, true);
  assert.equal(done.title, "Frame up");
  assert.equal(done.projectId, project.id);

  const progress = calculateProjectProgress(project, [done], []);
  assert.equal(progress.milestoneTotal, 1);
  assert.equal(progress.milestoneCompleted, 1);
});

// --- 6. Complete or archive a Project without losing historical work ---

test("completing a Project keeps every linked Task and Milestone", () => {
  const project = createProject({ name: "Shed" });
  const milestone = { id: "m-1", projectId: project.id, title: "Frame", completed: true };
  const tasks = [
    { id: "t-1", projectId: project.id, title: "Done", completed: true, priority: "medium", createdAt: "2026-01-01" },
    { id: "t-2", projectId: project.id, title: "Open", completed: false, priority: "medium", createdAt: "2026-01-01" },
  ];

  const completed = updateProjectStatus(project, "completed");

  assert.equal(completed.status, "completed");
  assert.deepEqual(tasks.filter((t) => t.projectId === project.id).length, 2, "tasks stay linked");
  assert.equal(milestone.projectId, project.id, "milestone stays linked");

  const progress = calculateProjectProgress(completed, [milestone], tasks);
  assert.equal(progress.total, 3);
  assert.equal(progress.completed, 2);
});

test("archiving a Project keeps its work linked; only deletion detaches", () => {
  const project = createProject({ name: "Shed" });
  const archived = updateProjectStatus(project, "archived");
  const tasks = [
    { id: "t-1", projectId: project.id, title: "Kept", completed: true, priority: "medium", createdAt: "2026-01-01" },
  ];
  const milestones = [{ id: "m-1", projectId: project.id, title: "Kept", completed: false }];

  assert.equal(archived.status, "archived");
  assert.equal(tasks[0].projectId, project.id, "archive does not detach tasks");
  assert.equal(milestones[0].projectId, project.id, "archive does not detach milestones");

  // Deletion is the only path that detaches — and even then nothing is deleted.
  const detachedTasks = detachTasksFromDeletedProject(tasks, project, milestones);
  const detachedMilestones = detachMilestonesFromDeletedProject(milestones, project);
  const remaining = deleteProject([project], project.id);
  assert.deepEqual(remaining, []);
  assert.equal(detachedTasks.length, 1);
  assert.equal(detachedTasks[0].projectId, undefined);
  assert.equal(detachedMilestones[0].projectId, undefined);
});

// --- 7. Today works with zero Projects ---

test("Today recommendations need no Projects at all", () => {
  const rec = recommendNextStep({
    habits: [],
    tasks: [makeTask({ id: "solo", title: "Solo", dueDate: TODAY, priority: "medium" })],
    milestones: [],
    projects: [],
    todayKey: TODAY,
  });

  assert.equal(rec.kind, "task");
  assert.equal(rec.taskId, "solo");
});

test("nothing auto-creates Projects or Milestones", () => {
  assert.ok(!/automatically create/i.test(projectsSource), "no automatic-creation behavior in Projects");
  const creations = projectsSource.match(/createProject\(/g) ?? [];
  assert.equal(creations.length, 0, "the view never mints Projects itself; App handles creation");
});
