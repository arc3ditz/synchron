import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDailyTimeline,
  formatClockTime,
  timeToMinutes,
  totalPlannedMinutes,
} from "../src/domain/timeline.ts";

const at = (day, hour, minute = 0) => new Date(2025, 4, day, hour, minute).getTime();
const NOW = new Date(2025, 4, 14, 12, 0);

const baseInput = {
  goals: [{ id: "goal-1", title: "Get Fit" }],
  milestones: [{ id: "m-1", title: "Milestone", goalId: "goal-1" }],
  projects: [],
  todayKey: "2025-05-14",
  dayResetHour: 0,
  now: NOW,
};

const habit = (overrides = {}) => ({
  id: 1,
  name: "Morning run",
  scheduledTime: "07:00",
  durationMinutes: 30,
  completedDates: [],
  category: undefined,
  priority: "Mandatory",
  ...overrides,
});

const task = (overrides = {}) => ({
  id: "t-1",
  title: "Write report",
  scheduledTime: "09:00",
  durationMinutes: undefined,
  estimatedMinutes: 45,
  completed: false,
  priority: "high",
  dueDate: "2025-05-14",
  goalId: "goal-1",
  ...overrides,
});

const session = (overrides = {}) => ({
  id: 11,
  timestamp: at(14, 8, 0),
  sessionType: "Timer",
  durationMinutes: 25,
  habitName: "Deep work",
  ...overrides,
});

test("timeToMinutes parses HH:MM and rejects anything else", () => {
  assert.equal(timeToMinutes("09:30"), 570);
  assert.equal(timeToMinutes("9:05"), 545);
  assert.equal(timeToMinutes("00:00"), 0);
  assert.equal(timeToMinutes(""), null);
  assert.equal(timeToMinutes("9am"), null);
  assert.equal(timeToMinutes("25:00"), null);
  assert.equal(timeToMinutes("12:60"), null);
});

test("formatClockTime renders local HH:MM", () => {
  assert.equal(formatClockTime(at(14, 9, 5)), "09:05");
});

test("scheduled Tasks and Habits render chronologically with context", () => {
  const blocks = buildDailyTimeline({
    ...baseInput,
    habits: [habit({ scheduledTime: "10:00" })],
    tasks: [task({ scheduledTime: "08:00" })],
    focusSessions: [],
  });

  assert.deepEqual(blocks.map((block) => block.key), ["task-t-1", "habit-1"]);
  assert.equal(blocks[0].time, "08:00");
  assert.equal(blocks[0].meta, "Get Fit");
  assert.equal(blocks[0].durationMinutes, 45);
  assert.equal(blocks[0].completed, false);
  assert.equal(blocks[1].meta, "Mandatory");
});

test("unscheduled and invalid-time items never render", () => {
  const blocks = buildDailyTimeline({
    ...baseInput,
    habits: [habit({ id: 2, scheduledTime: undefined }), habit({ id: 3, scheduledTime: "later" })],
    tasks: [task({ scheduledTime: undefined })],
    focusSessions: [],
  });

  assert.deepEqual(blocks, []);
});

test("Focus sessions for the logical day interleave chronologically", () => {
  const blocks = buildDailyTimeline({
    ...baseInput,
    habits: [],
    tasks: [task({ scheduledTime: "09:00" })],
    focusSessions: [session({ timestamp: at(14, 10, 0) })],
  });

  assert.deepEqual(blocks.map((block) => block.kind), ["task", "session"]);
  assert.equal(blocks[1].time, "10:00");
  assert.equal(blocks[1].durationMinutes, 25);
});

test("sessions outside the logical day are excluded (day-reset respected)", () => {
  const input = {
    ...baseInput,
    dayResetHour: 2,
    habits: [],
    tasks: [],
    focusSessions: [
      // 01:30 belongs to the previous logical day when reset is 02:00.
      session({ id: 1, timestamp: at(14, 1, 30) }),
      session({ id: 2, timestamp: at(14, 8, 0) }),
    ],
  };

  const blocks = buildDailyTimeline(input);
  assert.deepEqual(blocks.map((block) => block.sessionId), [2]);
});

test("rescheduling rebuilds order with the same keys (no duplicates)", () => {
  const habits = [habit({ scheduledTime: "10:00" })];
  const tasks = [task({ scheduledTime: "08:00" })];
  const before = buildDailyTimeline({ ...baseInput, habits, tasks, focusSessions: [] });
  assert.deepEqual(before.map((block) => block.key), ["task-t-1", "habit-1"]);

  const after = buildDailyTimeline({
    ...baseInput,
    habits,
    tasks: [task({ scheduledTime: "11:00" })],
    focusSessions: [],
  });
  assert.deepEqual(after.map((block) => [block.key, block.time]), [
    ["habit-1", "10:00"],
    ["task-t-1", "11:00"],
  ]);
});

test("timeline blocks preserve the Task relationship for Focus", () => {
  const blocks = buildDailyTimeline({
    ...baseInput,
    habits: [],
    tasks: [task({ id: "t-9", milestoneId: "m-1", scheduledTime: "08:00" })],
    focusSessions: [session({ id: 5, taskId: "t-9", habitName: "Write report" })],
  });

  const scheduled = blocks.find((block) => block.kind === "task");
  assert.equal(scheduled.taskId, "t-9");

  const logged = blocks.find((block) => block.kind === "session");
  assert.equal(logged.taskId, "t-9");
});

test("planned minutes count scheduled work only, never logged sessions", () => {
  const blocks = buildDailyTimeline({
    ...baseInput,
    habits: [habit({ durationMinutes: 30 })],
    tasks: [task({ estimatedMinutes: 45 })],
    focusSessions: [session({ durationMinutes: 25 })],
  });

  assert.equal(totalPlannedMinutes(blocks), 75);
});

test("completed and overdue flags ride along on Task blocks", () => {
  const blocks = buildDailyTimeline({
    ...baseInput,
    habits: [],
    tasks: [
      task({ id: "done", completed: true, dueDate: "2025-05-10", scheduledTime: "08:00" }),
      task({ id: "late", completed: false, dueDate: "2025-05-10", scheduledTime: "09:00" }),
    ],
    focusSessions: [],
  });

  assert.equal(blocks[0].completed, true);
  assert.equal(blocks[0].overdue, false);
  assert.equal(blocks[1].completed, false);
  assert.equal(blocks[1].overdue, true);
});
