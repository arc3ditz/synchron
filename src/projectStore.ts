export type ProjectStatus = "active" | "archived";

/**
 * A note is project-owned context, not an action. It records something worth
 * remembering; it has no completion state and never appears in Today.
 */
export interface ProjectNote {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A decision keeps both what was chosen and why. The statement and rationale
 * stay together so the reasoning is not separated from the choice later.
 */
export interface ProjectDecision {
  id: string;
  statement: string;
  rationale: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * The user's own account of where they stopped. It is written deliberately and
 * never inferred from edit history, so Synchron can show it as first-hand
 * resume context without pretending to know more than the user recorded.
 */
export interface ProjectResume {
  note: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A project is an organizing context, not a kind of action. Actions reference
 * a project by its stable `id`; notes and decisions belong to the project and
 * are stored inside this record so there is only one persistence system.
 */
export interface Project {
  id: string;
  name: string;
  description?: string;
  /** The outcome the user is pursuing right now. User-maintained only. */
  currentFocus?: string;
  /** The user's own note about where they left off. User-maintained only. */
  resume?: ProjectResume;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  notes: ProjectNote[];
  decisions: ProjectDecision[];
}

export interface ProjectStoreData {
  projects: Project[];
}

export interface ProjectStorageResult {
  ok: boolean;
  error?: string;
}

const STORAGE_KEY = "synchron.projects.v1";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

export function normalizeProjectName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function normalizeNote(value: unknown): ProjectNote | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || !value.id.trim()) return null;
  if (typeof value.title !== "string") return null;
  if (!isTimestamp(value.createdAt)) return null;

  const title = normalizeProjectName(value.title);
  if (!title) return null;

  return {
    id: value.id,
    title,
    content: typeof value.content === "string" ? value.content.trim() : "",
    createdAt: value.createdAt,
    updatedAt: isTimestamp(value.updatedAt) ? value.updatedAt : value.createdAt,
  };
}

function normalizeDecision(value: unknown): ProjectDecision | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || !value.id.trim()) return null;
  if (typeof value.statement !== "string") return null;
  if (!isTimestamp(value.createdAt)) return null;

  const statement = normalizeProjectName(value.statement);
  if (!statement) return null;

  return {
    id: value.id,
    statement,
    rationale: typeof value.rationale === "string" ? value.rationale.trim() : "",
    createdAt: value.createdAt,
    updatedAt: isTimestamp(value.updatedAt) ? value.updatedAt : value.createdAt,
  };
}

function normalizeResume(value: unknown): ProjectResume | null {
  if (!isRecord(value)) return null;
  if (typeof value.note !== "string") return null;
  if (!isTimestamp(value.createdAt)) return null;

  const note = value.note.trim();
  if (!note) return null;

  return {
    note,
    createdAt: value.createdAt,
    updatedAt: isTimestamp(value.updatedAt) ? value.updatedAt : value.createdAt,
  };
}

function normalizeCollection<T extends { id: string }>(
  value: unknown,
  normalize: (candidate: unknown) => T | null,
): T[] {
  if (!Array.isArray(value)) return [];

  // Duplicate identifiers would make later edits ambiguous, so the first
  // valid record wins and repeats are ignored rather than rewritten.
  const seen = new Set<string>();
  const items: T[] = [];
  for (const candidate of value) {
    const item = normalize(candidate);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return items;
}

function emptyStore(): ProjectStoreData {
  return { projects: [] };
}

function normalizeProject(value: unknown): Project | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || !value.id.trim()) return null;
  if (typeof value.name !== "string") return null;
  if (!isTimestamp(value.createdAt)) return null;

  const name = normalizeProjectName(value.name);
  if (!name) return null;

  const status: ProjectStatus = value.status === "archived" ? "archived" : "active";
  const updatedAt = isTimestamp(value.updatedAt) ? value.updatedAt : value.createdAt;
  const project: Project = {
    id: value.id,
    name,
    status,
    createdAt: value.createdAt,
    updatedAt,
    notes: normalizeCollection(value.notes, normalizeNote),
    decisions: normalizeCollection(value.decisions, normalizeDecision),
  };

  if (typeof value.description === "string") {
    const description = value.description.trim();
    if (description) project.description = description;
  }
  if (typeof value.currentFocus === "string") {
    const currentFocus = normalizeProjectName(value.currentFocus);
    if (currentFocus) project.currentFocus = currentFocus;
  }
  const resume = normalizeResume(value.resume);
  if (resume) project.resume = resume;
  if (status === "archived" && isTimestamp(value.archivedAt)) {
    project.archivedAt = value.archivedAt;
  }

  return project;
}

export function loadProjectStore(): ProjectStoreData {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !Array.isArray(parsed.projects)) return emptyStore();

    // A duplicated identifier would make later references ambiguous, so the
    // first valid record wins and any repeat is ignored rather than rewritten.
    const seen = new Set<string>();
    const projects: Project[] = [];
    for (const candidate of parsed.projects) {
      const project = normalizeProject(candidate);
      if (!project || seen.has(project.id)) continue;
      seen.add(project.id);
      projects.push(project);
    }

    return { projects };
  } catch {
    return emptyStore();
  }
}

export function persistProjectStore(data: ProjectStoreData): ProjectStorageResult {
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

export function findProjectByName(
  projects: Project[],
  name: string,
  excludeId?: string,
): Project | undefined {
  const target = normalizeProjectName(name).toLocaleLowerCase();
  if (!target) return undefined;

  return projects.find(
    (project) =>
      project.id !== excludeId &&
      normalizeProjectName(project.name).toLocaleLowerCase() === target,
  );
}

export function createProject(
  name: string,
  description = "",
  now = new Date().toISOString(),
): Project | null {
  const normalizedName = normalizeProjectName(name);
  if (!normalizedName) return null;

  const normalizedDescription = description.trim();
  return {
    id: createId(),
    name: normalizedName,
    ...(normalizedDescription ? { description: normalizedDescription } : {}),
    status: "active",
    createdAt: now,
    updatedAt: now,
    notes: [],
    decisions: [],
  };
}

export function renameProjectRecord(
  project: Project,
  name: string,
  now = new Date().toISOString(),
): Project {
  const normalizedName = normalizeProjectName(name);
  if (!normalizedName || normalizedName === project.name) return project;

  return { ...project, name: normalizedName, updatedAt: now };
}

export function updateProjectDescriptionRecord(
  project: Project,
  description: string,
  now = new Date().toISOString(),
): Project {
  const normalizedDescription = description.trim();
  if (normalizedDescription === (project.description ?? "")) return project;

  const next = { ...project, updatedAt: now };
  if (normalizedDescription) next.description = normalizedDescription;
  else delete next.description;
  return next;
}

/**
 * Marks projects as active after linked action work changes. The timestamp only
 * moves forward, so a delayed update can never rewind a project's history.
 * Projects that are not referenced are returned untouched.
 */
export function touchProjectsRecord(
  projects: Project[],
  projectIds: string[],
  at = new Date().toISOString(),
): Project[] {
  if (projectIds.length === 0) return projects;

  const ids = new Set(projectIds);
  let changed = false;
  const next = projects.map((project) => {
    if (!ids.has(project.id) || project.updatedAt >= at) return project;
    changed = true;
    return { ...project, updatedAt: at };
  });

  return changed ? next : projects;
}

export function archiveProjectRecord(
  project: Project,
  now = new Date().toISOString(),
): Project {
  if (project.status === "archived") return project;

  return {
    ...project,
    status: "archived",
    archivedAt: now,
    updatedAt: now,
  };
}

export function restoreProjectRecord(
  project: Project,
  now = new Date().toISOString(),
): Project {
  if (project.status === "active") return project;

  const { archivedAt: _archivedAt, ...restored } = project;
  return {
    ...restored,
    status: "active",
    updatedAt: now,
  };
}

export function updateProjectFocusRecord(
  project: Project,
  focus: string,
  now = new Date().toISOString(),
): Project {
  const normalizedFocus = normalizeProjectName(focus);
  if (normalizedFocus === (project.currentFocus ?? "")) return project;

  const next = { ...project, updatedAt: now };
  if (normalizedFocus) next.currentFocus = normalizedFocus;
  else delete next.currentFocus;
  return next;
}

export function updateProjectResumeRecord(
  project: Project,
  note: string,
  now = new Date().toISOString(),
): Project {
  const normalizedNote = note.trim();
  const existing = project.resume;

  if (!normalizedNote) {
    if (!existing) return project;
    const { resume: _resume, ...withoutResume } = project;
    return { ...withoutResume, updatedAt: now };
  }

  // The note is the user's own wording, so only the outer whitespace changes.
  // Internal line breaks and spacing are preserved as written.
  if (existing?.note === normalizedNote) return project;

  const resume: ProjectResume = existing
    ? { ...existing, note: normalizedNote, updatedAt: now }
    : { note: normalizedNote, createdAt: now, updatedAt: now };

  return { ...project, resume, updatedAt: now };
}

function createNoteRecord(
  title: string,
  content: string,
  now: string,
): ProjectNote | null {
  const normalizedTitle = normalizeProjectName(title);
  if (!normalizedTitle) return null;

  return {
    id: createId(),
    title: normalizedTitle,
    content: content.trim(),
    createdAt: now,
    updatedAt: now,
  };
}

export function addProjectNote(
  project: Project,
  title: string,
  content = "",
  now = new Date().toISOString(),
): Project | null {
  const note = createNoteRecord(title, content, now);
  if (!note) return null;

  return {
    ...project,
    notes: [note, ...project.notes],
    updatedAt: now,
  };
}

export function updateProjectNote(
  project: Project,
  noteId: string,
  title: string,
  content: string,
  now = new Date().toISOString(),
): Project | null {
  const note = project.notes.find((candidate) => candidate.id === noteId);
  if (!note) return null;

  const normalizedTitle = normalizeProjectName(title);
  if (!normalizedTitle) return null;
  const normalizedContent = content.trim();
  if (normalizedTitle === note.title && normalizedContent === note.content) return project;

  const nextNote: ProjectNote = {
    ...note,
    title: normalizedTitle,
    content: normalizedContent,
    updatedAt: now,
  };
  return {
    ...project,
    notes: project.notes.map((candidate) => (candidate.id === noteId ? nextNote : candidate)),
    updatedAt: now,
  };
}

export function deleteProjectNote(
  project: Project,
  noteId: string,
  now = new Date().toISOString(),
): Project {
  const notes = project.notes.filter((candidate) => candidate.id !== noteId);
  if (notes.length === project.notes.length) return project;

  return { ...project, notes, updatedAt: now };
}

function createDecisionRecord(
  statement: string,
  rationale: string,
  now: string,
): ProjectDecision | null {
  const normalizedStatement = normalizeProjectName(statement);
  const normalizedRationale = rationale.trim();
  if (!normalizedStatement || !normalizedRationale) return null;

  return {
    id: createId(),
    statement: normalizedStatement,
    rationale: normalizedRationale,
    createdAt: now,
    updatedAt: now,
  };
}

export function addProjectDecision(
  project: Project,
  statement: string,
  rationale: string,
  now = new Date().toISOString(),
): Project | null {
  const decision = createDecisionRecord(statement, rationale, now);
  if (!decision) return null;

  return {
    ...project,
    decisions: [decision, ...project.decisions],
    updatedAt: now,
  };
}

export function updateProjectDecision(
  project: Project,
  decisionId: string,
  statement: string,
  rationale: string,
  now = new Date().toISOString(),
): Project | null {
  const decision = project.decisions.find((candidate) => candidate.id === decisionId);
  if (!decision) return null;

  const normalizedStatement = normalizeProjectName(statement);
  const normalizedRationale = rationale.trim();
  if (!normalizedStatement || !normalizedRationale) return null;
  if (
    normalizedStatement === decision.statement &&
    normalizedRationale === decision.rationale
  ) {
    return project;
  }

  const nextDecision: ProjectDecision = {
    ...decision,
    statement: normalizedStatement,
    rationale: normalizedRationale,
    updatedAt: now,
  };
  return {
    ...project,
    decisions: project.decisions.map((candidate) =>
      candidate.id === decisionId ? nextDecision : candidate,
    ),
    updatedAt: now,
  };
}

export function deleteProjectDecision(
  project: Project,
  decisionId: string,
  now = new Date().toISOString(),
): Project {
  const decisions = project.decisions.filter((candidate) => candidate.id !== decisionId);
  if (decisions.length === project.decisions.length) return project;

  return { ...project, decisions, updatedAt: now };
}
