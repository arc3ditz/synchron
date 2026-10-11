import type { AppSettings } from "../types";

export type ViewMode = AppSettings["viewMode"];

export function restoreViewMode(value: unknown, fallback: ViewMode): ViewMode {
  if (value === "grid" || value === "list") return value;
  return fallback;
}
