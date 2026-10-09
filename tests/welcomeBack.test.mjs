import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  WELCOME_BACK_THRESHOLD_DAYS,
  dateKeyFromTimestamp,
  getLatestActivityKey,
  getWelcomeBackSubtitle,
  getWelcomeBackTitle,
  isValidDateKey,
  shouldShowWelcomeBack,
} from "../src/domain/welcomeBack.ts";
import { shiftDateKey } from "../src/utils/dates.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const todaySource = readFileSync(path.join(root, "src/components/Today.tsx"), "utf8");
const appSource = readFileSync(path.join(root, "src/App.tsx"), "utf8");
const domainSource = readFileSync(path.join(root, "src/domain/welcomeBack.ts"), "utf8");
const storageSource = readFileSync(path.join(root, "src/utils/storage.ts"), "utf8");

const TODAY = "2026-10-09";
const daysAgo = (n) => shiftDateKey(TODAY, -n);

function habitWith(dates) {
  return { id: 1, name: "Read", completedDates: dates };
}

function sessionOn(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return {
    id: 1,
    timestamp: new Date(y, m - 1, d, 12, 0, 0).getTime(),
    sessionType: "Timer",
    durationMinutes: 25,
    habitName: "Read",
  };
}

// --- Ordinary launches stay quiet ---

test("ordinary launch on the same day does not show the welcome", () => {
  const decision = shouldShowWelcomeBack({
    habits: [habitWith([TODAY])],
    focusSessions: [],
    lastSeenKey: TODAY,
    todayKey: TODAY,
  });
  assert.equal(decision.show, false);
});

test("ordinary daily launch (one day gap) does not show the welcome", () => {
  const decision = shouldShowWelcomeBack({
    habits: [habitWith([daysAgo(1)])],
    focusSessions: [],
    lastSeenKey: daysAgo(1),
    todayKey: TODAY,
  });
  assert.equal(decision.show, false);
  assert.ok(decision.daysAway < WELCOME_BACK_THRESHOLD_DAYS);
});

test("short break below the threshold stays on the normal Today experience", () => {
  const decision = shouldShowWelcomeBack({
    habits: [],
    focusSessions: [],
    lastSeenKey: daysAgo(WELCOME_BACK_THRESHOLD_DAYS - 1),
    todayKey: TODAY,
  });
  assert.equal(decision.show, false);
});

// --- Returning after inactivity ---

test("return after a meaningful gap shows one calm welcome", () => {
  const decision = shouldShowWelcomeBack({
    habits: [habitWith([daysAgo(10)])],
    focusSessions: [],
    lastSeenKey: daysAgo(10),
    todayKey: TODAY,
  });
  assert.equal(decision.show, true);
  assert.equal(decision.daysAway, 10);
  assert.equal(decision.lastActivityKey, daysAgo(10));
});

test("threshold boundary: exactly at threshold shows, one day before does not", () => {
  const atThreshold = shouldShowWelcomeBack({
    habits: [],
    focusSessions: [],
    lastSeenKey: daysAgo(WELCOME_BACK_THRESHOLD_DAYS),
    todayKey: TODAY,
  });
  assert.equal(atThreshold.show, true);

  const below = shouldShowWelcomeBack({
    habits: [],
    focusSessions: [],
    lastSeenKey: daysAgo(WELCOME_BACK_THRESHOLD_DAYS - 1),
    todayKey: TODAY,
  });
  assert.equal(below.show, false);
});

test("most recent signal wins: habit completion, focus session, or last seen", () => {
  const viaHabit = shouldShowWelcomeBack({
    habits: [habitWith([daysAgo(9)])],
    focusSessions: [sessionOn(daysAgo(2))],
    lastSeenKey: daysAgo(9),
    todayKey: TODAY,
  });
  // A focus session 2 days ago means this is an ordinary launch.
  assert.equal(viaHabit.show, false);

  const viaSession = shouldShowWelcomeBack({
    habits: [habitWith([daysAgo(30)])],
    focusSessions: [sessionOn(daysAgo(8))],
    lastSeenKey: daysAgo(30),
    todayKey: TODAY,
  });
  assert.equal(viaSession.show, true);
  assert.equal(viaSession.lastActivityKey, daysAgo(8));
});

test("welcome copy never mentions failure, streaks, or falling behind", () => {
  const copy = `${getWelcomeBackTitle()} ${getWelcomeBackSubtitle()}`;
  assert.ok(copy.length > 0 && copy.length < 200, "brief welcome");
  assert.doesNotMatch(copy, /fail|streak|behind|missed|overdue|catch.?up|lost|fall/i);
});

// --- Missing or unreliable activity data falls back to Today ---

test("missing activity data falls back to the normal Today experience", () => {
  const decision = shouldShowWelcomeBack({
    habits: [],
    focusSessions: [],
    lastSeenKey: null,
    todayKey: TODAY,
  });
  assert.equal(decision.show, false);
  assert.equal(decision.lastActivityKey, null);
});

test("fresh install with no completions or sessions never shows the welcome", () => {
  const decision = shouldShowWelcomeBack({
    habits: [{ id: 1, name: "New", completedDates: [] }],
    focusSessions: [],
    lastSeenKey: undefined,
    todayKey: TODAY,
  });
  assert.equal(decision.show, false);
});

test("corrupt, future, and invalid activity data is ignored", () => {
  assert.equal(isValidDateKey("not-a-date"), false);
  assert.equal(isValidDateKey("2026-13-99"), false);
  assert.equal(isValidDateKey(123), false);
  assert.equal(dateKeyFromTimestamp(Number.NaN), null);
  assert.equal(dateKeyFromTimestamp(-5), null);

  const corrupt = shouldShowWelcomeBack({
    habits: [{ id: 1, name: "H", completedDates: ["garbage", "2026-13-40"] }],
    focusSessions: [{ timestamp: Number.NaN }],
    lastSeenKey: "{corrupt",
    todayKey: TODAY,
  });
  assert.equal(corrupt.show, false);

  // Future-dated signals cannot create a false return or a crash.
  const future = shouldShowWelcomeBack({
    habits: [habitWith([shiftDateKey(TODAY, 5)])],
    focusSessions: [],
    lastSeenKey: shiftDateKey(TODAY, 5),
    todayKey: TODAY,
  });
  assert.equal(future.show, false);
  assert.equal(getLatestActivityKey({
    habits: [habitWith([shiftDateKey(TODAY, 5)])],
    focusSessions: [],
    lastSeenKey: shiftDateKey(TODAY, 5),
    todayKey: TODAY,
  }), null);
});

// --- Wiring: calm banner, one next action, no resets, no intrusions ---

test("Today surfaces a calm, dismissible welcome above the existing next action", () => {
  assert.ok(todaySource.includes('from "../domain/welcomeBack"'), "reuse the welcome domain");
  assert.ok(todaySource.includes('data-testid="welcome-back"'), "stable test hook");
  assert.ok(todaySource.includes("renderWelcomeBack"), "single render path");
  assert.ok(todaySource.includes("getWelcomeBackTitle()"), "calm title from the domain");
  assert.ok(todaySource.includes("getWelcomeBackSubtitle()"), "supporting line from the domain");
  assert.ok(todaySource.includes("Dismiss"), "quiet in-session dismissal");

  const welcomeIndex = todaySource.indexOf("renderWelcomeBack()");
  const nextIndex = todaySource.indexOf("renderNextStep()");
  assert.ok(welcomeIndex !== -1 && nextIndex !== -1 && welcomeIndex < nextIndex,
    "welcome sits above the Next Step hero so one useful action stays immediate");

  // The hero still renders on a returning launch.
  assert.ok(todaySource.includes('data-testid="next-step"'), "next action still surfaced");
});

test("Today welcome is a non-blocking section, not a dialog or catch-up workflow", () => {
  const welcome = todaySource.match(/function renderWelcomeBack\(\)[\s\S]*?\n  \}/);
  assert.ok(welcome, "welcome renders through one function");
  assert.ok(welcome[0].includes("<section"), "inline banner, not a modal");
  assert.ok(!welcome[0].includes("role=\"dialog\""), "no intrusive dialog");
  assert.ok(!welcome[0].includes("alertdialog"), "no blocking alert dialog");
  assert.ok(!/plan|cach.?up|overdue|clear|review/i.test(welcome[0]),
    "no forced daily plan or overdue review inside the welcome");
});

test("App derives the welcome from reliable local data and records the visit", () => {
  assert.ok(appSource.includes("shouldShowWelcomeBack"), "App reuses the domain decision");
  assert.ok(appSource.includes("STORAGE_KEYS.LAST_SEEN"), "reuses existing storage patterns");
  assert.ok(appSource.includes("welcomeBack={welcomeBack}"), "passes the decision to Today");
  assert.ok(
    appSource.includes("saveStorageData(STORAGE_KEYS.LAST_SEEN"),
    "records this launch so the same welcome is not shown on every launch",
  );
  assert.ok(storageSource.includes('LAST_SEEN'), "last-seen key lives with existing keys");
});

test("App never resets goals, habits, tasks, or progress for the welcome", () => {
  assert.ok(!/setHabits\(\s*\[\s*\]\)/.test(appSource), "habits are never cleared");
  assert.ok(!/setTasks\(\s*\[\s*\]\)/.test(appSource), "tasks are never cleared");
  assert.ok(!/setGoals\(\s*\[\s*\]\)/.test(appSource), "goals are never cleared");
  assert.ok(domainSource.includes("No network"), "domain stays local-only");
  assert.ok(!/new Notification|push notification|backend|fetch\(/.test(domainSource),
    "no push notifications or backend services in the welcome domain");
});
