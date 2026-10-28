/**
 * Date formatting shared by the surfaces that describe when something
 * happened. Every value here comes from a stored timestamp; nothing is
 * inferred or invented.
 */

const fullDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const monthDayFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});

const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "long" });

/** An absolute date, e.g. "3 Nov 2025". Empty when the value is not a date. */
export function formatProjectDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : fullDateFormatter.format(date);
}

/**
 * A short, honest description of how long ago something happened: "today",
 * "yesterday", a weekday name inside the last week, then a plain date. It
 * never rounds a stored timestamp into a phrase the user did not write.
 */
export function formatRelativeProjectDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const daysAgo = Math.round((startOfToday - startOfDate) / 86_400_000);

  if (daysAgo <= 0) return "today";
  if (daysAgo === 1) return "yesterday";
  if (daysAgo < 7) return weekdayFormatter.format(date);
  if (date.getFullYear() === now.getFullYear()) return monthDayFormatter.format(date);
  return fullDateFormatter.format(date);
}
