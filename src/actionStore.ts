export type ActionStatus = "open" | "completed";
export type Importance = "low" | "normal" | "high" | "critical";
export type EffortMinutes = 5 | 15 | 30 | 60 | 120;

export const IMPORTANCE_LEVELS: Importance[] = ["low", "normal", "high", "critical"];
export const EFFORT_OPTIONS: EffortMinutes[] = [5, 15, 30, 60, 120];

export interface Action {
  id: string;
  title: string;
  status: ActionStatus;
  createdAt: string;
  /**
   * Last substantive change: an edit, completion, or reopening. Legacy records
   * fall back to createdAt. Focus changes are working state, not edits, so they
   * do not move this timestamp.
   */
  updatedAt?: string;
  dueDate?: string;
  importance: Importance;
  effortMinutes?: EffortMinutes;
  focusedDate?: string;
  completedAt?: string;
  /**
   * Organizing context for this action. Actions remain canonical and are never
   * copied into a project; this is only a reference to a project's stable id.
   */
  projectId?: string;
}

export interface InboxItem {
  id: string;
  title: string;
  createdAt: string;
}

export interface ActionStoreData {
  actions: Action[];
  inbox: InboxItem[];
}

export interface StorageResult {
  ok: boolean;
  error?: string;
}

const STORAGE_KEY = "synchron.actions.v1";
const IMPORTANCE_RANK: Record<Importance, number> = { low: 1, normal: 2, high: 3, critical: 4 };

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isImportance(value: unknown): value is Importance {
  return value === "low" || value === "normal" || value === "high" || value === "critical";
}

function isEffort(value: unknown): value is EffortMinutes {
  return value === 5 || value === 15 || value === 30 || value === 60 || value === 120;
}

function normalizeAction(value: unknown): Action | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    (value.status !== "open" && value.status !== "completed") ||
    typeof value.createdAt !== "string"
  ) {
    return null;
  }

  // The legacy boolean is intentionally read only as a migration bridge. New data uses four levels.
  const legacyImportant = value.important === true;
  const importance = isImportance(value.importance) ? value.importance : legacyImportant ? "high" : "normal";
  const action: Action = {
    id: value.id,
    title: value.title,
    status: value.status,
    createdAt: value.createdAt,
    updatedAt:
      typeof value.updatedAt === "string" && value.updatedAt.length > 0
        ? value.updatedAt
        : value.createdAt,
    importance,
  };

  if (isDateKey(value.dueDate)) action.dueDate = value.dueDate;
  if (isEffort(value.effortMinutes)) action.effortMinutes = value.effortMinutes;
  if (isDateKey(value.focusedDate)) action.focusedDate = value.focusedDate;
  if (typeof value.completedAt === "string") action.completedAt = value.completedAt;
  // Older records have no project reference at all, which stays valid. A bad
  // reference is dropped rather than keeping a non-string value in the model.
  if (typeof value.projectId === "string" && value.projectId.length > 0) {
    action.projectId = value.projectId;
  }
  return action;
}

function normalizeInboxItem(value: unknown): InboxItem | null {
  return isRecord(value) && typeof value.id === "string" && typeof value.title === "string" && typeof value.createdAt === "string"
    ? { id: value.id, title: value.title, createdAt: value.createdAt }
    : null;
}

function emptyStore(): ActionStoreData {
  return { actions: [], inbox: [] };
}

export function localDateKey(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function loadActionStore(): ActionStoreData {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return emptyStore();

    return {
      actions: Array.isArray(parsed.actions) ? parsed.actions.map(normalizeAction).filter((action): action is Action => action !== null) : [],
      inbox: Array.isArray(parsed.inbox) ? parsed.inbox.map(normalizeInboxItem).filter((item): item is InboxItem => item !== null) : [],
    };
  } catch {
    return emptyStore();
  }
}

export function persistActionStore(data: ActionStoreData): StorageResult {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Changes are only in memory because local storage is unavailable.",
    };
  }
}

export function createAction(
  title: string,
  fields: Partial<Pick<Action, "dueDate" | "importance" | "effortMinutes" | "projectId">> = {},
  now = new Date().toISOString(),
): Action {
  return {
    id: createId(),
    title: title.trim(),
    status: "open",
    createdAt: now,
    updatedAt: now,
    importance: fields.importance ?? "normal",
    ...(fields.dueDate ? { dueDate: fields.dueDate } : {}),
    ...(fields.effortMinutes ? { effortMinutes: fields.effortMinutes } : {}),
    ...(fields.projectId ? { projectId: fields.projectId } : {}),
  };
}

export function createInboxItem(title: string): InboxItem {
  return {
    id: createId(),
    title: title.trim(),
    createdAt: new Date().toISOString(),
  };
}

export type ActionChanges = Partial<Pick<Action, "title" | "dueDate" | "importance" | "effortMinutes" | "projectId">>;

export function updateActionRecord(
  action: Action,
  changes: ActionChanges,
  now = new Date().toISOString(),
): Action {
  const next = { ...action, ...changes };
  if (changes.dueDate === undefined && Object.prototype.hasOwnProperty.call(changes, "dueDate")) delete next.dueDate;
  if (changes.effortMinutes === undefined && Object.prototype.hasOwnProperty.call(changes, "effortMinutes")) delete next.effortMinutes;
  if (changes.projectId === undefined && Object.prototype.hasOwnProperty.call(changes, "projectId")) delete next.projectId;

  // Saving the same values is not activity. Returning the original object also
  // keeps callers from persisting or timestamping a no-op.
  const unchanged =
    next.title === action.title &&
    next.dueDate === action.dueDate &&
    next.importance === action.importance &&
    next.effortMinutes === action.effortMinutes &&
    next.projectId === action.projectId;
  if (unchanged) return action;

  return { ...next, updatedAt: now };
}

export function completeActionRecord(action: Action, completedAt = new Date().toISOString()): Action {
  if (action.status === "completed") return action;
  const { focusedDate: _focusedDate, ...withoutFocus } = action;
  return { ...withoutFocus, status: "completed", completedAt, updatedAt: completedAt };
}

export function reopenActionRecord(action: Action, now = new Date().toISOString()): Action {
  if (action.status === "open") return action;
  const { completedAt: _completedAt, ...withoutCompletion } = action;
  return { ...withoutCompletion, status: "open", updatedAt: now };
}

export function isOverdue(action: Action, todayDate: string): boolean {
  return action.dueDate !== undefined && action.dueDate < todayDate;
}

export function isDueToday(action: Action, todayDate: string): boolean {
  return action.dueDate === todayDate;
}

export function isFocusedToday(action: Action, todayDate: string): boolean {
  return action.focusedDate === todayDate;
}

export function isScheduledForToday(action: Action, todayDate: string): boolean {
  return action.status === "open" && (isOverdue(action, todayDate) || isDueToday(action, todayDate) || isFocusedToday(action, todayDate));
}

export function getActionReasons(action: Action, todayDate: string): string[] {
  const reasons: string[] = [];
  if (isOverdue(action, todayDate)) reasons.push("Overdue");
  else if (isDueToday(action, todayDate)) reasons.push("Due today");
  if (isFocusedToday(action, todayDate)) reasons.push("In today’s focus");
  if (action.importance === "critical") reasons.push("Critical importance");
  else if (action.importance === "high") reasons.push("High importance");
  return reasons;
}

export interface NextActionChoice {
  action: Action;
  reason: string;
}

const nextActionDueFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

function formatNextActionDueDate(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return nextActionDueFormatter.format(new Date(year, month - 1, day));
}

function nextActionBucket(action: Action, todayDate: string): number {
  if (isOverdue(action, todayDate)) return 0;
  if (isDueToday(action, todayDate)) return 1;
  if (isFocusedToday(action, todayDate)) return 2;
  if (action.dueDate) return 3;
  return 4;
}

/**
 * Explains why an action is the next one using only recorded facts: its due
 * date, today's focus, or its importance. It never claims that work happened.
 */
export function describeNextAction(action: Action, todayDate: string): string {
  const bucket = nextActionBucket(action, todayDate);
  if (bucket === 0) return "Overdue";
  if (bucket === 1) return "Due today";
  if (bucket === 2) return "In today’s focus";
  if (bucket === 3 && action.dueDate) return `Due ${formatNextActionDueDate(action.dueDate)}`;
  if (action.importance === "critical") return "Critical importance";
  if (action.importance === "high") return "High importance";
  return "Oldest open action";
}

/**
 * Picks the most relevant open action deterministically. Due commitments come
 * first, then explicit focus, then importance, then the action that has waited
 * longest. Ties resolve by id so the choice does not change between renders.
 */
export function selectNextOpenAction(
  actions: Action[],
  todayDate: string,
): NextActionChoice | undefined {
  const open = actions.filter((action) => action.status === "open");
  if (open.length === 0) return undefined;

  const [next] = [...open].sort((left, right) => {
    const bucketDifference = nextActionBucket(left, todayDate) - nextActionBucket(right, todayDate);
    if (bucketDifference !== 0) return bucketDifference;

    const leftDue = left.dueDate ?? "";
    const rightDue = right.dueDate ?? "";
    if (leftDue !== rightDue) {
      if (!leftDue) return 1;
      if (!rightDue) return -1;
      return leftDue.localeCompare(rightDue);
    }

    const importanceDifference = IMPORTANCE_RANK[right.importance] - IMPORTANCE_RANK[left.importance];
    if (importanceDifference !== 0) return importanceDifference;

    const createdDifference = left.createdAt.localeCompare(right.createdAt);
    if (createdDifference !== 0) return createdDifference;

    return left.id.localeCompare(right.id);
  });

  return { action: next, reason: describeNextAction(next, todayDate) };
}

export function prioritizeActions(actions: Action[], todayDate: string): Action[] {
  return actions.filter((action) => isScheduledForToday(action, todayDate)).sort((left, right) => {
    const leftDueBucket = isOverdue(left, todayDate) ? 0 : isDueToday(left, todayDate) ? 1 : 2;
    const rightDueBucket = isOverdue(right, todayDate) ? 0 : isDueToday(right, todayDate) ? 1 : 2;
    if (leftDueBucket !== rightDueBucket) return leftDueBucket - rightDueBucket;

    const leftFocusBucket = isFocusedToday(left, todayDate) ? 0 : 1;
    const rightFocusBucket = isFocusedToday(right, todayDate) ? 0 : 1;
    if (leftFocusBucket !== rightFocusBucket) return leftFocusBucket - rightFocusBucket;

    const importanceDifference = IMPORTANCE_RANK[right.importance] - IMPORTANCE_RANK[left.importance];
    if (importanceDifference !== 0) return importanceDifference;

    const createdDifference = left.createdAt.localeCompare(right.createdAt);
    return createdDifference !== 0 ? createdDifference : left.id.localeCompare(right.id);
  });
}
