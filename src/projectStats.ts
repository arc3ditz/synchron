import {
  selectNextOpenAction,
  type Action,
  type NextActionChoice,
} from "./actionStore.ts";
import { projectLastActivityAt } from "./projectActivity.ts";
import type { Project } from "./projectStore.ts";

/**
 * What a project row (or any compact surface) can honestly say about a
 * project without opening it. Every value is derived from the canonical
 * records the user already keeps: real counts, real timestamps, and a next
 * action chosen by the same deterministic ranking the Tasks section uses.
 * Nothing here estimates progress, invents a percentage, or scores health.
 */
export interface ProjectSummary {
  /** Unresolved work, in plain numbers. */
  openCount: number;
  /** Finished work, kept in view so the row shows scope, not only debt. */
  completedCount: number;
  /** The project's own next open action and the stated reason for it. */
  next?: NextActionChoice;
  /** The most recent recorded change, the same value other surfaces use. */
  lastActivityAt: string;
}

export function buildProjectSummary(project: Project, actions: Action[]): ProjectSummary {
  const linked = actions.filter((action) => action.projectId === project.id);
  const open = linked.filter((action) => action.status === "open");
  const completed = linked.filter((action) => action.status === "completed");

  return {
    openCount: open.length,
    completedCount: completed.length,
    next: selectNextOpenAction(open, todayKeyForSummary()),
    lastActivityAt: projectLastActivityAt(project, actions),
  };
}

/**
 * A date key for the current day, matching the app's own convention. Kept
 * local to this module so the derived summary stays a pure function of its
 * inputs plus "now".
 */
function todayKeyForSummary(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * The exact wording a row uses for its open/completed counts. Centralized so
 * the index rows and any other compact surface say it the same way.
 */
export function formatProjectCountLabel(
  openCount: number,
  completedCount: number,
): string {
  const openLabel =
    openCount === 0
      ? "No open actions"
      : openCount === 1
        ? "1 open action"
        : `${openCount} open actions`;
  if (completedCount === 0) return openLabel;
  const completedLabel =
    completedCount === 1 ? "1 completed" : `${completedCount} completed`;
  return openCount === 0 ? completedLabel : `${openLabel} · ${completedLabel}`;
}
