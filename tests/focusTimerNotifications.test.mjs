import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  clearIntelligentNotificationCooldown,
  getIntelligentNotification,
  isIntelligentNotificationDuplicate,
  registerFocusTimerRunningState,
  resetIntelligentNotificationDedupeForTesting,
  sendIntelligentNotification,
  shouldHandleNotificationAction,
  shouldSendIntelligentNotification,
} from "../src/domain/notificationLogic.ts";
import { getTodayKey } from "../src/utils/dates.ts";
import { STORAGE_KEYS } from "../src/utils/storage.ts";
import { configureSfx, playSfx, primeAudioContext } from "../src/utils/sfx.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSource = readFileSync(path.join(root, "src/App.tsx"), "utf8");

function settings(overrides = {}) {
  return {
    enableIntelligentNotifications: true,
    notificationFrequency: "balanced",
    habitReminders: true,
    incompleteHabitReminders: false,
    dayResetHour: 0,
    ...overrides,
  };
}

function remindableHabit(id) {
  // scheduledTime at the current hour always matches the timing window.
  const hour = new Date().getHours();
  return {
    id,
    name: `Habit ${id}`,
    priority: "Optional",
    type: "Daily",
    completedDates: [],
    scheduledTime: `${hour}:00`,
  };
}

function currentHour() {
  return new Date().getHours();
}

test("cooldowns are enforced per frequency and can be cleared", () => {
  clearIntelligentNotificationCooldown();
  const base = 100_000_000;

  assert.equal(shouldSendIntelligentNotification("timing", settings(), base), true);
  assert.equal(shouldSendIntelligentNotification("timing", settings(), base + 1000), false);

  clearIntelligentNotificationCooldown();
  assert.equal(
    shouldSendIntelligentNotification("timing", settings({ notificationFrequency: "frequent" }), base), true,
  );
  assert.equal(
    shouldSendIntelligentNotification("timing", settings({ notificationFrequency: "frequent" }), base + 20 * 60 * 1000 + 1),
    true,
    "frequent allows resend after 20 minutes",
  );

  clearIntelligentNotificationCooldown();
  assert.equal(
    shouldSendIntelligentNotification("timing", settings({ notificationFrequency: "conservative" }), base), true,
  );
  assert.equal(
    shouldSendIntelligentNotification("timing", settings({ notificationFrequency: "conservative" }), base + 119 * 60 * 1000),
    false,
    "conservative still cools down before 120 minutes",
  );
});

test("the poller rotates habits instead of repeating the same nudge", async () => {
  clearIntelligentNotificationCooldown();
  const hour = currentHour();
  const todayKey = getTodayKey(0);
  const list = [remindableHabit(1), remindableHabit(2)];

  const first = getIntelligentNotification(list, 0, hour, 25, settings());
  assert.equal(first?.habitId, 1);

  await sendIntelligentNotification(first, settings());
  assert.equal(isIntelligentNotificationDuplicate("timing", 1, todayKey), true);

  // The nudged habit is skipped, so selection rotates to the next habit.
  const second = getIntelligentNotification(list, 0, hour, 25, settings());
  assert.equal(second?.habitId, 2);

  // Delivery is still cooldown-gated: the blocked resend marks nothing, so
  // the same candidate is selected again instead of being dropped silently.
  await sendIntelligentNotification(second, settings());
  assert.equal(isIntelligentNotificationDuplicate("timing", 2, todayKey), false);
  assert.equal(getIntelligentNotification(list, 0, hour, 25, settings())?.habitId, 2);
});

test("a sent nudge is deduped for the rest of the logical day only", async () => {
  clearIntelligentNotificationCooldown();
  const hour = currentHour();
  const todayKey = getTodayKey(0);

  const notification = getIntelligentNotification([remindableHabit(3)], 0, hour, 25, settings());
  assert.equal(notification?.habitId, 3);
  await sendIntelligentNotification(notification, settings());

  assert.equal(isIntelligentNotificationDuplicate("timing", 3, todayKey), true);
  assert.equal(isIntelligentNotificationDuplicate("timing", 3, "2099-01-01"), false);
});

test("duplicate notification delivery claims once and persists one dedupe record", async () => {
  const values = new Map();
  let historyWrites = 0;
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, String(value));
      if (key === STORAGE_KEYS.INTELLIGENT_NOTIFICATION_HISTORY) historyWrites += 1;
    },
    removeItem: (key) => values.delete(key),
  };
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    resetIntelligentNotificationDedupeForTesting();
    const notification = {
      type: "timing",
      title: "Focus",
      body: "Start now",
      habitId: 91,
      habitName: "Read",
    };
    await sendIntelligentNotification(notification, settings());
    await sendIntelligentNotification(notification, settings());

    assert.equal(historyWrites, 1, "one accepted notification performs one history write");
    const history = JSON.parse(values.get(STORAGE_KEYS.INTELLIGENT_NOTIFICATION_HISTORY));
    assert.deepEqual(history.keys, [`timing:91:${getTodayKey(0)}`]);
  } finally {
    console.error = originalConsoleError;
    delete globalThis.localStorage;
    resetIntelligentNotificationDedupeForTesting();
  }
});

test("duplicate native and browser action events are coalesced but later actions remain valid", () => {
  const recent = new Map();
  const action = {
    type: "focus-habit",
    habitId: 17,
    habitName: "Read",
    durationMinutes: 5,
  };
  assert.equal(shouldHandleNotificationAction(action, recent, 1000), true);
  assert.equal(shouldHandleNotificationAction({ ...action }, recent, 1500), false);
  assert.equal(shouldHandleNotificationAction({ ...action, habitId: 18 }, recent, 1500), true);
  assert.equal(shouldHandleNotificationAction(action, recent, 3000), true);
});

test("completed, archived, and deleted habits are not reminder candidates", () => {
  clearIntelligentNotificationCooldown();
  const hour = currentHour();
  const todayKey = getTodayKey(0);
  const candidates = [
    { ...remindableHabit(32), isArchived: true },
    { ...remindableHabit(33), completedDates: [todayKey] },
  ];

  assert.equal(getIntelligentNotification(candidates, 0, hour, 25, settings()), null);
  assert.equal(getIntelligentNotification([], 0, hour, 25, settings()), null);
});

test("active snoozes suppress timing and incomplete reminders until their return time", () => {
  clearIntelligentNotificationCooldown();
  const hour = currentHour();
  const timedHabit = remindableHabit(34);
  const incompleteHabit = { ...remindableHabit(36), scheduledTime: undefined };
  const snoozes = [
    { kind: "habit", id: timedHabit.id, returnAt: Date.now() + 60_000 },
    { kind: "habit", id: incompleteHabit.id, returnAt: Date.now() + 60_000 },
  ];
  const reminderSettings = settings({
    incompleteHabitReminders: true,
    snoozes,
  });

  assert.equal(
    getIntelligentNotification([timedHabit], 0, hour, 25, reminderSettings),
    null,
  );
  assert.equal(
    getIntelligentNotification([incompleteHabit], 0, Math.max(18, hour), 25, reminderSettings),
    null,
  );
  assert.equal(
    getIntelligentNotification(
      [incompleteHabit],
      0,
      Math.max(18, hour),
      25,
      {
        ...reminderSettings,
        snoozes: snoozes.map((snooze) => ({ ...snooze, returnAt: Date.now() - 1 })),
      },
    )?.habitId,
    incompleteHabit.id,
    "an expired snooze becomes eligible on the next scheduler evaluation",
  );
});

test("the scheduler reevaluates current snoozes when the app returns without changing its cadence", () => {
  assert.ok(appSource.includes("snoozes: todaySnoozesRef.current"));
  assert.ok(appSource.includes("window.setInterval(checkNotifications, 5 * 60 * 1000)"));
  assert.ok(appSource.includes('window.addEventListener("focus", checkNotifications)'));
  assert.ok(appSource.includes('document.addEventListener("visibilitychange", handleVisibilityChange)'));
});

test("sent reminder history and frequency cooldown survive a process restart", async () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  try {
    clearIntelligentNotificationCooldown();
    const todayKey = getTodayKey(0);
    const habit = remindableHabit(35);
    const notification = getIntelligentNotification(
      [habit],
      0,
      currentHour(),
      25,
      settings(),
    );
    assert.ok(notification);
    await sendIntelligentNotification(notification, settings());

    const stored = JSON.parse(values.get(STORAGE_KEYS.INTELLIGENT_NOTIFICATION_HISTORY));
    assert.equal(stored.dayKey, todayKey);
    assert.ok(stored.keys.includes(`timing:${habit.id}:${todayKey}`));
    assert.ok(stored.lastSentAt > 0);

    resetIntelligentNotificationDedupeForTesting();
    assert.equal(isIntelligentNotificationDuplicate("timing", habit.id, todayKey), true);
    assert.equal(
      shouldSendIntelligentNotification("timing", settings(), Date.now() + 1000),
      false,
      "the existing frequency cooldown also survives restart",
    );
  } finally {
    delete globalThis.localStorage;
    clearIntelligentNotificationCooldown();
  }
});

test("a running focus timer suppresses intelligent notifications until it stops", () => {
  clearIntelligentNotificationCooldown();
  const hour = currentHour();
  const list = [remindableHabit(4)];

  assert.notEqual(getIntelligentNotification(list, 0, hour, 25, settings()), null);

  const unregister = registerFocusTimerRunningState(() => true);
  assert.equal(getIntelligentNotification(list, 0, hour, 25, settings()), null);
  assert.equal(shouldSendIntelligentNotification("timing", settings(), Date.now()), false);

  unregister();
  clearIntelligentNotificationCooldown();
  assert.notEqual(getIntelligentNotification(list, 0, hour, 25, settings()), null);
});

test("notifications respect the master switch and per-type settings", () => {
  clearIntelligentNotificationCooldown();
  const hour = currentHour();
  const list = [remindableHabit(5)];
  const stamp = 5_000_000;

  assert.equal(
    getIntelligentNotification(list, 0, hour, 25, settings({ enableIntelligentNotifications: false })),
    null,
  );
  assert.equal(
    shouldSendIntelligentNotification("timing", settings({ enableIntelligentNotifications: false }), stamp),
    false,
  );
  assert.equal(
    shouldSendIntelligentNotification("timing", settings({ habitReminders: false }), stamp),
    false,
  );
  assert.equal(
    shouldSendIntelligentNotification("incomplete", settings({ incompleteHabitReminders: false }), stamp),
    false,
  );
  assert.equal(shouldSendIntelligentNotification("availability", settings(), stamp), false);
  assert.equal(
    getIntelligentNotification(list, 0, hour, 25, settings({ habitReminders: false })),
    null,
    "no timing candidates are considered when reminders are off",
  );
});

test("sound playback is safe without an audio device and honors silent configs", () => {
  assert.doesNotThrow(() => primeAudioContext());

  for (const event of ["start", "pauseResume", "habitComplete", "pomodoroTransition", "timerComplete"]) {
    assert.doesNotThrow(() => playSfx(event));
  }

  configureSfx({ enabled: false });
  assert.doesNotThrow(() => playSfx("timerComplete"));

  configureSfx({ enabled: true, volume: 0, sfxEnabled: { timerComplete: false } });
  assert.doesNotThrow(() => playSfx("timerComplete"));

  // Restore defaults for any later tests in this process.
  configureSfx({
    enabled: true,
    volume: 80,
    sfxEnabled: {
      start: true,
      pauseResume: true,
      habitComplete: true,
      pomodoroTransition: true,
      timerComplete: true,
    },
  });
  clearIntelligentNotificationCooldown();
});
