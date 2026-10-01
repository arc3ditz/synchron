import type { Habit, Program } from "../types";
import { diffInDays } from "../utils/dates.ts";

export function getChallengeMetadata(
  habit: Habit,
  programs: Program[],
): { startDate: string; durationDays: number } | undefined {
  const program = programs.find((item) => item.id === habit.programId);
  const startDate = program?.startDate ?? habit.startDate;
  const durationDays = program?.durationDays ?? habit.durationDays;
  if (!startDate || !durationDays || durationDays <= 0) return undefined;
  return { startDate, durationDays };
}

export function isChallengeActiveOnDate(
  habit: Habit,
  dateKey: string,
  programs: Program[],
): boolean {
  if (habit.type !== "Challenge") return false;
  const metadata = getChallengeMetadata(habit, programs);
  if (!metadata) return false;
  const daysElapsed = diffInDays(dateKey, metadata.startDate);
  return daysElapsed >= 0 && daysElapsed < metadata.durationDays;
}

export function getChallengeDayNumber(
  habit: Habit,
  dateKey: string,
  programs: Program[],
): number {
  const metadata = getChallengeMetadata(habit, programs);
  if (!metadata) return 1;
  const daysElapsed = diffInDays(dateKey, metadata.startDate);
  return Math.max(1, daysElapsed + 1);
}

export function countCompletedInWindow(habit: Habit, programs: Program[]): number {
  if (habit.type !== "Challenge") return 0;
  const metadata = getChallengeMetadata(habit, programs);
  if (!metadata) return 0;

  return habit.completedDates.filter((date) => {
    const offset = diffInDays(date, metadata.startDate);
    return offset >= 0 && offset < metadata.durationDays;
  }).length;
}