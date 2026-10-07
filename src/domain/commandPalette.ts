export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  keywords?: string;
}

/**
 * Fast case-insensitive substring filter over label, keywords, and id.
 * Empty query returns everything in definition order.
 */
export function filterCommands(commands: PaletteCommand[], query: string): PaletteCommand[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return commands;
  return commands.filter((command) =>
    command.label.toLowerCase().includes(needle) ||
    command.id.toLowerCase().includes(needle) ||
    (command.keywords ?? "").toLowerCase().includes(needle),
  );
}

/**
 * Arrow-key movement with wrap-around. Out-of-range positions (e.g. after the
 * filter shrinks the list) are clamped into range before stepping.
 */
export function nextSelectedIndex(current: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  const clamped = Math.min(Math.max(current, 0), count - 1);
  return (clamped + delta + count) % count;
}
