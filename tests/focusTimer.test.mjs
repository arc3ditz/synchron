import assert from "node:assert/strict";
import test from "node:test";
import { getFocusSessionsForLogicalToday } from "../src/domain/focusTimer.ts";

process.env.TZ = "Asia/Tokyo";

test("Daily Overview keeps after-midnight sessions in the prior logical day before reset", () => {
  const now = new Date(2026, 9, 2, 2, 30);
  const sessions = [
    { id: 1, timestamp: new Date(2026, 9, 2, 1, 15).getTime(), durationMinutes: 25 },
    { id: 2, timestamp: new Date(2026, 9, 1, 23, 30).getTime(), durationMinutes: 15 },
    { id: 3, timestamp: new Date(2026, 9, 2, 4, 0).getTime(), durationMinutes: 45 },
  ];

  assert.deepEqual(
    getFocusSessionsForLogicalToday(sessions, 4, now).map((session) => session.id),
    [1, 2],
  );
});