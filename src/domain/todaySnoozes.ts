export type TodaySnooze =
  | { kind: "habit"; id: number; returnAt: number }
  | { kind: "task"; id: string; returnAt: number };

export type TodaySnoozeTarget =
  | { kind: "habit"; id: number }
  | { kind: "task"; id: string };

export const DEFAULT_SNOOZE_RETURN_MINUTES = 240;
export const SNOOZE_RETURN_MINUTES = [30, 60, 120, 240, 480] as const;

export function isTodaySnooze(value: unknown): value is TodaySnooze {
  if (typeof value !== "object" || value === null) return false;
  const snooze = value as Record<string, unknown>;
  return Number.isFinite(snooze.returnAt) &&
    (snooze.kind === "habit"
      ? Number.isInteger(snooze.id)
      : snooze.kind === "task" && typeof snooze.id === "string" && snooze.id !== "");
}

export function getActiveTodaySnoozes(
  snoozes: readonly TodaySnooze[],
  now: number,
): { habitIds: ReadonlySet<number>; taskIds: ReadonlySet<string> } {
  const habitIds = new Set<number>();
  const taskIds = new Set<string>();
  for (const snooze of snoozes) {
    if (snooze.returnAt <= now) continue;
    if (snooze.kind === "habit") habitIds.add(snooze.id);
    else taskIds.add(snooze.id);
  }
  return { habitIds, taskIds };
}

export function getTodaySnoozeIds(
  snoozes: readonly TodaySnooze[],
): { habitIds: ReadonlySet<number>; taskIds: ReadonlySet<string> } {
  const habitIds = new Set<number>();
  const taskIds = new Set<string>();
  for (const snooze of snoozes) {
    if (snooze.kind === "habit") habitIds.add(snooze.id);
    else taskIds.add(snooze.id);
  }
  return { habitIds, taskIds };
}

export function snoozeTodayItem(
  snoozes: readonly TodaySnooze[],
  item: TodaySnoozeTarget,
  now: number,
  returnAfterMinutes: number,
): TodaySnooze[] {
  const returnAt = now + returnAfterMinutes * 60_000;
  const withoutItem = snoozes.filter((snooze) => snooze.kind !== item.kind || snooze.id !== item.id);
  if (item.kind === "habit") return [...withoutItem, { kind: "habit", id: item.id, returnAt }];
  return [...withoutItem, { kind: "task", id: item.id, returnAt }];
}

export function removeTodaySnooze(
  snoozes: readonly TodaySnooze[],
  item: TodaySnoozeTarget,
): TodaySnooze[] {
  return snoozes.filter((snooze) => snooze.kind !== item.kind || snooze.id !== item.id);
}
