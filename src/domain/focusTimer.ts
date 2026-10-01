import { getHabitDateKey } from "../utils/dates.ts";

export interface TimestampedFocusSession {
  timestamp: number;
}

export function getFocusSessionsForLogicalToday<T extends TimestampedFocusSession>(
  sessions: T[],
  dayResetHour: number,
  now = new Date(),
): T[] {
  const todayKey = getHabitDateKey(now, dayResetHour);
  return sessions.filter((session) =>
    getHabitDateKey(new Date(session.timestamp), dayResetHour) === todayKey,
  );
}