import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { recommendNextStep } from "../src/domain/nextStep.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const todaySource = readFileSync(path.join(root, "src/components/Today.tsx"), "utf8");

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

function makeHabit(overrides = {}) {
  return {
    id: 1,
    name: "Habit",
    priority: "Optional",
    type: "Daily",
    completedDates: [],
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    habits: [],
    tasks: [],
    goals: [],
    milestones: [],
    projects: [],
    todayKey: TODAY,
    ...overrides,
  };
}

// --- Single focal point: hero first, lists after ---

test("recommendation hero stays the top focal point of Today", () => {
  const heroIndex = todaySource.indexOf("{renderNextStep()}");
  const tasksIndex = todaySource.indexOf("Today&rsquo;s Tasks");
  const habitsIndex = todaySource.indexOf("Today's Habits");
  const timelineIndex = todaySource.indexOf("Scheduled Today");
  const actionsIndex = todaySource.indexOf("Quick Actions");
  for (const [name, idx] of [["tasks", tasksIndex], ["habits", habitsIndex], ["timeline", timelineIndex], ["actions", actionsIndex]]) {
    assert.ok(heroIndex !== -1 && idx !== -1 && heroIndex < idx, `hero renders above ${name}`);
  }
  assert.ok(todaySource.includes('aria-label="Next step"'), "hero keeps its landmark");
  assert.ok(todaySource.includes('aria-live="polite"'), "hero updates announce politely");
});

test("section hierarchy and headings stay intact", () => {
  for (const heading of ["Today&rsquo;s Tasks", "Today's Habits", "Scheduled Today", "Quick Actions"]) {
    assert.ok(todaySource.includes(heading), `section heading preserved: ${heading}`);
  }
});

// --- Overflow grouped: stale backlog collapses, nothing hidden ---

test("stale backlog collapses behind one toggle, defaulting to calm", () => {
  assert.ok(todaySource.includes("freshTodayTasks") && todaySource.includes("backlogTodayTasks"));
  assert.ok(todaySource.includes("isTaskStaleBacklog(task, todayKey)"), "split reuses the shared stale definition");
  assert.ok(todaySource.includes("const [showBacklog, setShowBacklog] = useState(false)"), "backlog starts collapsed");
  assert.ok(todaySource.includes("Show backlog ("), "toggle names the hidden count");
  assert.ok(todaySource.includes("Hide backlog"), "toggle reverses");
  assert.ok(todaySource.includes('aria-expanded={showBacklog}'), "toggle exposes its state to assistive tech");
  assert.ok(
    todaySource.includes("pendingTodayTasks.length === 0 && completedTodayTasks.length === 0"),
    "true-empty copy still requires zero tasks of any age",
  );
});

test("grouping is presentation-only: order, counts, and data untouched", () => {
  assert.ok(todaySource.includes("pendingTodayTasks"), "pending partition still drives the section");
  assert.ok(todaySource.includes("briefingParts"), "briefing still counts every open task");
  assert.ok(!/backlogTodayTasks\.filter|backlog.*delete|deleteTask\(.*backlog/i.test(todaySource), "no destructive handling of backlog");
  assert.ok(todaySource.includes("Backlog since"), "expanded backlog rows keep their truthful quiet label");
});

// --- Engine still protects habits and fresh work from backlog ---

test("stale backlog cannot outrank today's habits or fresh work", () => {
  const rec = recommendNextStep(input({
    tasks: [makeTask({ id: "stale", title: "Old", dueDate: "2026-08-01", priority: "high" })],
    habits: [makeHabit({ id: 9, name: "Read", priority: "Optional" })],
  }));
  assert.equal(rec.kind, "habit", "optional habit outranks very old overdue");
  const fresh = recommendNextStep(input({
    tasks: [
      makeTask({ id: "stale", title: "Stale", dueDate: "2026-08-01", priority: "high" }),
      makeTask({ id: "fresh", title: "Fresh", dueDate: "2026-10-08", priority: "low" }),
    ],
  }));
  assert.equal(fresh.taskId, "fresh", "fresh overdue outranks stale backlog");
});

// --- Serene aesthetic: tokens only, both themes ---

test("Today uses theme tokens only, safe in light and dark modes", () => {
  const noComments = todaySource.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/#[0-9a-fA-F]{3,8}/.test(noComments), "no hardcoded hex colors");
  assert.ok(!/(^|[^\w-])rgba?\(/.test(noComments), "no hardcoded rgb colors");
  assert.ok(todaySource.includes("var(--"), "renders through Synchron CSS variables");
});
