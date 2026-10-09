import assert from "node:assert/strict";
import test from "node:test";
import {
  clearIntelligentNotificationCooldown,
  getIntelligentNotification,
  isIntelligentNotificationDuplicate,
  registerFocusTimerRunningState,
  sendIntelligentNotification,
  shouldSendIntelligentNotification,
} from "../src/domain/notificationLogic.ts";
import { getTodayKey } from "../src/utils/dates.ts";import { configureSfx, playSfx, primeAudioContext } from "../src/utils/sfx.ts";

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
