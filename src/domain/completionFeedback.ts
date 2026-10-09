/**
 * Calm completion feedback copy.
 *
 * Pure and clock-free: the caller decides what was completed and whether it
 * was the last open item; this module only shapes the words. Language stays
 * concise and neutral — no streaks, points, celebrations, guilt, or
 * pressure — so finishing a small action feels satisfying without becoming
 * gamified or distracting.
 */

/** How long the quiet confirmation stays visible before dismissing itself. */
export const COMPLETION_CONFIRMATION_MS = 6000;

export function getCompletionMessage(completedTitle: string, wasFinal: boolean): string {
  const title = completedTitle.trim();
  const done = title === "" ? "Done." : `Done — ${title}.`;
  return wasFinal ? `${done} All clear for today.` : done;
}
