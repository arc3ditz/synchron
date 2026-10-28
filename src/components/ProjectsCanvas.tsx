import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ArrowLeft, ArrowRight, MoreHorizontal } from "lucide-react";
import { selectNextOpenAction, type Action, type NextActionChoice } from "../actionStore";
import { formatProjectDate, formatRelativeProjectDate } from "../dates";
import {
  buildProjectActivity,
  projectActivityKindLabel,
  projectActivityTargetId,
  projectLastActivityAt,
  type ProjectActivityEntry,
} from "../projectActivity";
import type {
  Project,
  ProjectDecision,
  ProjectEditableFields,
  ProjectNote,
  ProjectResume,
} from "../projectStore";
import type { ActionsController } from "../hooks/useActions";
import type { ProjectMutationResult, ProjectsController } from "../hooks/useProjects";
import { ActionForm, ActionList, ActionRow, todayKey } from "./ActionViews";
import { EditIcon, PlusIcon, TrashIcon } from "./icons";
import { AnchoredPopover, useConfirm } from "./Overlays";

type ProjectFilter = "active" | "archived" | "all";

/**
 * How a project should open. The Projects index row menu asks for the shared
 * edit form; deep links from other surfaces keep naming a bare target item.
 */
export type ProjectOpenIntent = "edit";

const PROJECT_FILTERS: ProjectFilter[] = ["active", "archived", "all"];

function sortByRecent(projects: Project[], actions: Action[]): Project[] {
  return [...projects].sort(
    (left, right) =>
      projectLastActivityAt(right, actions).localeCompare(projectLastActivityAt(left, actions)) ||
      left.name.localeCompare(right.name),
  );
}

const RECENT_CONTEXT_LIMIT = 3;

function sortContextItems<T extends { id: string; createdAt: string; updatedAt: string }>(
  items: T[],
): T[] {
  return [...items].sort(
    (left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) ||
      right.createdAt.localeCompare(left.createdAt) ||
      left.id.localeCompare(right.id),
  );
}

function formatContextMeta(
  kind: "Note" | "Decision",
  item: { createdAt: string; updatedAt: string },
): string {
  const created = formatProjectDate(item.createdAt);
  return item.updatedAt === item.createdAt
    ? `${kind} · Created ${created}`
    : `${kind} · Updated ${formatRelativeProjectDate(item.updatedAt)} · Created ${created}`;
}

function formatResumeMeta(resume: ProjectResume): string {
  return resume.updatedAt === resume.createdAt
    ? `Written ${formatRelativeProjectDate(resume.createdAt)}`
    : `Edited ${formatRelativeProjectDate(resume.updatedAt)} · Written ${formatProjectDate(resume.createdAt)}`;
}

function focusContextTarget(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  // An instant jump keeps the target fully visible even when smooth scrolling
  // is unavailable or interrupted. The focus ring confirms where it landed.
  target.scrollIntoView({ block: "center", behavior: "auto" });
  target.focus({ preventScroll: true });
}

/**
 * Activity links can point at a note or decision that is still collapsed behind
 * "Show all". The reveal happens in a state update, so the target may not exist
 * yet on the first attempt; retry briefly instead of silently dropping the jump.
 */
function focusWhenAvailable(id: string, attempts = 4) {
  if (document.getElementById(id)) {
    focusContextTarget(id);
    return;
  }
  if (attempts > 0) window.setTimeout(() => focusWhenAvailable(id, attempts - 1), 20);
}

interface ContextLink {
  key: string;
  kind: string;
  text: string;
  meta: string;
  targetId: string;
  ariaLabel: string;
}

/**
 * One list shape for both "Worth remembering" and "Recent activity": a quiet
 * kind label, the item's own wording, its real timestamp, and a jump link.
 */
function ContextLinks({
  links,
  onJump,
  leadingTitle = false,
}: {
  links: ContextLink[];
  onJump: (targetId: string) => void;
  /** Overview variant: the item's own wording leads, the kind label sits under it. */
  leadingTitle?: boolean;
}) {
  return (
    <ul
      className={
        leadingTitle ? "context-links context-links--leading-title" : "context-links"
      }
    >
      {links.map((link) => (
        <li key={link.key} className="context-links__item">
          <button
            type="button"
            className="context-links__link"
            aria-label={link.ariaLabel}
            onClick={() => onJump(link.targetId)}
          >
            <span className="context-links__kind">{link.kind}</span>
            <span className="context-links__text">{link.text}</span>
            <span className="context-links__meta">{link.meta}</span>
            <ArrowRight className="context-links__arrow" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function activityLink(entry: ProjectActivityEntry): ContextLink {
  const kind = projectActivityKindLabel(entry.kind);
  const when = `${entry.label.toLowerCase()} ${formatRelativeProjectDate(entry.at)}`;
  return {
    key: entry.key,
    kind,
    text: entry.title,
    meta: when,
    targetId: projectActivityTargetId(entry.target),
    ariaLabel:
      entry.target.kind === "resume"
        ? `Go to where I left off (${when})`
        : `Go to ${kind.toLowerCase()}: ${entry.title} (${when})`,
  };
}

function focusAfterContextRemoval(row: Element | null, fallback: () => void) {
  window.setTimeout(() => {
    if (row?.isConnected) return;
    fallback();
  }, 0);
}

function focusAfterProjectRowChange(row: Element | null) {
  window.setTimeout(() => {
    if (row?.isConnected) return;
    const nextRow = document.querySelector<HTMLElement>(".project-row__open");
    const activeFilter = document.querySelector<HTMLElement>(
      '.filter-bar__button[aria-pressed="true"]',
    );
    const formInput = document.querySelector<HTMLElement>(".project-form__input");
    (nextRow ?? activeFilter ?? formInput)?.focus();
  }, 0);
}

function ProjectFilterBar({
  filter,
  counts,
  onChange,
}: {
  filter: ProjectFilter;
  counts: Record<ProjectFilter, number>;
  onChange: (filter: ProjectFilter) => void;
}) {
  return (
    <div className="filter-bar" role="group" aria-label="Filter projects">
      {PROJECT_FILTERS.map((option) => (
        <button
          key={option}
          type="button"
          className={
            filter === option
              ? "filter-bar__button filter-bar__button--active"
              : "filter-bar__button"
          }
          aria-pressed={filter === option}
          onClick={() => onChange(option)}
        >
          {option[0].toUpperCase() + option.slice(1)}{" "}
          <span className="filter-bar__count">{counts[option]}</span>
        </button>
      ))}
    </div>
  );
}

function ProjectForm({
  onCreate,
  onCancel,
  autoFocus = false,
}: {
  onCreate: (name: string) => ProjectMutationResult;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = onCreate(name);
    if (!result.ok) {
      setError(result.error);
      inputRef.current?.focus();
      inputRef.current?.select();
      return;
    }

    setName("");
    setError(undefined);
  }

  return (
    <form className="project-form" onSubmit={submit} noValidate>
      <input
        ref={inputRef}
        className="project-form__input"
        aria-label="Project name"
        placeholder="Name a project"
        value={name}
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          setName(event.target.value);
          if (error) setError(undefined);
        }}
      />
      <div className="project-form__actions">
        {onCancel && (
          <button type="button" className="action-button" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="action-button action-button--primary action-button--with-icon"
        >
          <PlusIcon aria-hidden="true" />
          <span>Create project</span>
        </button>
      </div>
      {error && (
        <p id={errorId} className="project-form__error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function ProjectRow({
  project,
  projects,
  actions,
  onOpen,
  onDeleteProject,
}: {
  project: Project;
  projects: ProjectsController;
  actions: Action[];
  onOpen: (id: string, intent?: ProjectOpenIntent) => void;
  /** Runs the shared delete confirmation; see useProjectDelete. */
  onDeleteProject: ProjectDeleteRequest;
}) {
  const isArchived = project.status === "archived";
  const rowRef = useRef<HTMLLIElement>(null);
  const lastActivityAt = projectLastActivityAt(project, actions);
  // One supporting detail per row, drawn from data the user already has:
  // open work count while active, the archive date once archived.
  const openCount = actions.filter(
    (action) => action.projectId === project.id && action.status === "open",
  ).length;
  const detail = isArchived
    ? `Archived ${formatRelativeProjectDate(project.archivedAt ?? lastActivityAt)}`
    : openCount > 0
      ? openCount === 1
        ? "1 open action"
        : `${openCount} open actions`
      : "No open actions";

  function toggleArchive() {
    const row = rowRef.current;
    if (isArchived) projects.restoreProject(project.id);
    else projects.archiveProject(project.id);
    focusAfterProjectRowChange(row);
  }

  function requestDelete() {
    // Confirm the delete against this row's own menu trigger: it may remain
    // mounted (a failed write) or unmount with the row (a successful delete).
    const trigger =
      rowRef.current?.querySelector<HTMLButtonElement>(".project-row__menu-trigger") ??
      null;
    onDeleteProject(project, trigger, (result) => {
      // The controller's storage warning reports failures; handle focus.
      if (result.ok) focusAfterProjectRowChange(rowRef.current);
    });
  }

  return (
    <li ref={rowRef} className={isArchived ? "project-row project-row--archived" : "project-row"}>
      {/* The name and focus line are both visible inside the button, so the
          accessible name includes them rather than overriding them. The menu
          trigger is a sibling, not a child, so opening it can never activate
          this open button. */}
      <button type="button" className="project-row__open" onClick={() => onOpen(project.id)}>
        <span className="visually-hidden">Open </span>
        <span className="project-row__name">{project.name}</span>
        {project.currentFocus && (
          <span className="project-row__focus">{project.currentFocus}</span>
        )}
        <span className="project-row__detail">{detail}</span>
      </button>
      <div className="project-row__operations">
        {/* Project-level management stays secondary here too: the same quiet
            overflow menu the workspace header uses, so both surfaces expose
            exactly the same actions. */}
        <AnchoredPopover
          label={`Options for ${project.name}`}
          triggerLabel=""
          className="project-row__menu-trigger"
          icon={<MoreHorizontal aria-hidden="true" />}
        >
          {(close) => (
            <ProjectMenuActions
              isArchived={isArchived}
              close={close}
              onEdit={() => onOpen(project.id, "edit")}
              onToggleArchive={toggleArchive}
              onDelete={requestDelete}
            />
          )}
        </AnchoredPopover>
      </div>
    </li>
  );
}

function ProjectList({
  projects,
  projectsController,
  actions,
  filter,
  onFilterChange,
  onOpen,
  onDeleteProject,
}: {
  projects: Project[];
  projectsController: ProjectsController;
  actions: Action[];
  filter: ProjectFilter;
  onFilterChange: (filter: ProjectFilter) => void;
  onOpen: (id: string, intent?: ProjectOpenIntent) => void;
  onDeleteProject: ProjectDeleteRequest;
}) {
  if (projects.length === 0) {
    const copy =
      filter === "active"
        ? {
            title: "No active projects.",
            body: "Start a new project with the button above, or restore one from the archive.",
          }
        : filter === "archived"
          ? {
              title: "Nothing archived.",
              body: "Projects you archive keep their details and remain available here.",
            }
          : { title: "No projects yet.", body: "Create a project above to get started." };

    return (
      <div className="empty empty--compact">
        <h2 className="empty__title">{copy.title}</h2>
        <p className="empty__body">{copy.body}</p>
        {filter !== "all" && (
          <button type="button" className="context-action" onClick={() => onFilterChange("all")}>
            Show all projects
          </button>
        )}
      </div>
    );
  }

  return (
    <ul className="project-list">
      {projects.map((project) => (
        <ProjectRow
          key={project.id}
          project={project}
          projects={projectsController}
          actions={actions}
          onOpen={onOpen}
          onDeleteProject={onDeleteProject}
        />
      ))}
    </ul>
  );
}

function ProjectsIndex({
  projects,
  actions,
  actionsStorageError,
  filter,
  onFilterChange,
  onOpen,
  onDeleteProject,
}: {
  projects: ProjectsController;
  actions: Action[];
  /** A failed write to the action store, such as detaching a deleted project. */
  actionsStorageError?: string;
  filter: ProjectFilter;
  onFilterChange: (filter: ProjectFilter) => void;
  /** Opens the project list row; intent opens straight into the shared edit form. */
  onOpen: (id: string, intent?: ProjectOpenIntent) => void;
  onDeleteProject: ProjectDeleteRequest;
}) {
  const [creating, setCreating] = useState(false);
  const firstProjectActionRef = useRef<HTMLButtonElement>(null);
  const newProjectActionRef = useRef<HTMLButtonElement>(null);
  // Deleting a project writes to both stores, but they report the same
  // failure. Show one warning per distinct message.
  const storageMessages = useMemo(() => {
    const messages = [projects.storageError, actionsStorageError].filter(
      (message): message is string => Boolean(message),
    );
    return Array.from(new Set(messages));
  }, [projects.storageError, actionsStorageError]);
  const activeProjects = useMemo(
    () =>
      sortByRecent(
        projects.projects.filter((project) => project.status === "active"),
        actions,
      ),
    [projects.projects, actions],
  );
  const archivedProjects = useMemo(
    () =>
      sortByRecent(
        projects.projects.filter((project) => project.status === "archived"),
        actions,
      ),
    [projects.projects, actions],
  );
  const counts: Record<ProjectFilter, number> = {
    active: activeProjects.length,
    archived: archivedProjects.length,
    all: projects.projects.length,
  };
  const visibleProjects =
    filter === "active"
      ? activeProjects
      : filter === "archived"
        ? archivedProjects
        : sortByRecent(projects.projects, actions);
  const isFirstProject = projects.projects.length === 0;

  function createProject(name: string): ProjectMutationResult {
    const result = projects.addProject(name);
    if (result.ok) onOpen(result.project.id);
    return result;
  }

  return (
    <>
      <header className="projects-index__header">
        <div>
          <h1 className="canvas__title projects-index__title" tabIndex={-1}>
            Projects
          </h1>
          <p className="projects-index__tagline">Your work, in one place.</p>
        </div>
        {!isFirstProject && !creating && (
          <button
            type="button"
            ref={newProjectActionRef}
            className="action-button action-button--primary action-button--with-icon"
            onClick={() => setCreating(true)}
          >
            <PlusIcon aria-hidden="true" />
            <span>New project</span>
          </button>
        )}
      </header>

      {storageMessages.map((message) => (
        <p key={message} className="storage-warning" role="status">
          {message}
        </p>
      ))}

      {isFirstProject && !creating ? (
        <section className="empty projects-empty" aria-labelledby="projects-empty-title">
          <h2 id="projects-empty-title" className="empty__title">
            Keep the thread of a project.
          </h2>
          <p className="empty__body projects-empty__body">
            A project keeps its tasks, notes, decisions, and background in one place, so you can
            resume without reconstructing the context.
          </p>
          <button
            type="button"
            ref={firstProjectActionRef}
            className="action-button action-button--primary action-button--with-icon projects-empty__action"
            onClick={() => setCreating(true)}
          >
            <PlusIcon aria-hidden="true" />
            <span>Create your first project</span>
          </button>
        </section>
      ) : creating ? (
        <ProjectForm
          onCreate={createProject}
          onCancel={() => {
            setCreating(false);
            window.setTimeout(() => {
              (isFirstProject ? firstProjectActionRef : newProjectActionRef).current?.focus();
            }, 0);
          }}
          autoFocus
        />
      ) : (
        <>
          <ProjectFilterBar filter={filter} counts={counts} onChange={onFilterChange} />
          <ProjectList
            projects={visibleProjects}
            projectsController={projects}
            actions={actions}
            filter={filter}
            onFilterChange={onFilterChange}
            onOpen={onOpen}
            onDeleteProject={onDeleteProject}
          />
        </>
      )}
    </>
  );
}

function ProjectActions({
  project,
  actions,
  projects,
  nextActionId,
  actionFormInputId,
}: {
  project: Project;
  actions: ActionsController;
  projects: Project[];
  nextActionId?: string;
  actionFormInputId: string;
}) {
  const titleId = useId();
  const todayDate = todayKey();
  const isArchived = project.status === "archived";
  const linkedActions = actions.actions.filter((action) => action.projectId === project.id);
  const openActions = linkedActions.filter((action) => action.status === "open");
  const completedActions = linkedActions
    .filter((action) => action.status === "completed")
    .sort(
      (left, right) =>
        (right.completedAt ?? "").localeCompare(left.completedAt ?? "") ||
        left.title.localeCompare(right.title),
    );
  const hasActions = linkedActions.length > 0;

  return (
    <section className="project-actions" aria-labelledby={titleId}>
      <div className="project-actions__heading">
        <h2 id={titleId} className="project-actions__title">
          Tasks
        </h2>
        <span className="project-actions__count">
          {openActions.length} open
        </span>
      </div>
      <p className="project-actions__intro">
        {isArchived
          ? "This project is archived. Its actions remain part of Today and Actions."
          : nextActionId
            ? "Add work here. The next action is shown in Overview."
            : "Add work here, or assign an existing action from Today and Actions."}
      </p>

      {isArchived ? (
        <p className="project-actions__note">
          Restore this project to add new actions.
        </p>
      ) : (
        <ActionForm
          projectId={project.id}
          inputId={actionFormInputId}
          onSubmit={(draft) => actions.addAction({ ...draft, projectId: project.id })}
        />
      )}

      {openActions.length > 0 && (
        <>
          <ActionList
            items={openActions}
            actions={actions}
            projects={projects}
            todayDate={todayDate}
            empty=""
            anchorPrefix="project-action-"
          />
        </>
      )}
      {hasActions && openActions.length === 0 && (
        <p className="project-actions__empty">No open actions right now.</p>
      )}
      {!hasActions && (
        <p className="project-actions__empty">
          {isArchived
            ? "This project has no actions."
            : "Actions assigned to this project will gather here."}
        </p>
      )}

      {completedActions.length > 0 && (
        <>
          <h3 className="project-actions__subtitle">
            Completed
            <span className="project-actions__count">{completedActions.length}</span>
          </h3>
          <ActionList
            items={completedActions}
            actions={actions}
            projects={projects}
            todayDate={todayDate}
            empty=""
            anchorPrefix="project-action-"
          />
        </>
      )}
    </section>
  );
}

function ProjectFocus({
  project,
  projects,
}: {
  project: Project;
  projects: ProjectsController;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.currentFocus ?? "");
  const [error, setError] = useState<string>();
  const titleId = useId();
  const inputId = useId();
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const isArchived = project.status === "archived";

  function beginEdit() {
    setDraft(project.currentFocus ?? "");
    setError(undefined);
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(project.currentFocus ?? "");
    setError(undefined);
    setEditing(false);
    window.setTimeout(() => editButtonRef.current?.focus(), 0);
  }

  function save() {
    const result = projects.updateProjectFocus(project.id, draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setDraft(result.project.currentFocus ?? "");
    setError(undefined);
    setEditing(false);
    window.setTimeout(() => editButtonRef.current?.focus(), 0);
  }

  return (
    <section className="project-focus" aria-labelledby={titleId}>
      <div className="project-focus__heading">
        <h2 id={titleId} className="project-focus__title">
          Current focus
        </h2>
        {!isArchived && !editing && (
          <button
            ref={editButtonRef}
            type="button"
            className="context-action"
            onClick={beginEdit}
          >
            <EditIcon aria-hidden="true" />
            <span>{project.currentFocus ? "Edit focus" : "Set focus"}</span>
          </button>
        )}
      </div>

      {editing ? (
        <>
          <label className="visually-hidden" htmlFor={inputId}>
            Current focus
          </label>
          <textarea
            id={inputId}
            className="project-detail__textarea project-focus__textarea"
            value={draft}
            autoFocus
            placeholder="What outcome are you pursuing right now?"
            onChange={(event) => {
              setDraft(event.target.value);
              if (error) setError(undefined);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelEdit();
              } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                save();
              }
            }}
          />
          <div className="project-detail__edit-actions">
            <button type="button" className="action-button" onClick={cancelEdit}>
              Cancel
            </button>
            <button
              type="button"
              className="action-button action-button--primary"
              onClick={save}
            >
              Save focus
            </button>
          </div>
          {error && (
            <p className="project-detail__error" role="alert">
              {error}
            </p>
          )}
        </>
      ) : project.currentFocus ? (
        <p className="project-focus__value">{project.currentFocus}</p>
      ) : (
        <p className="project-focus__value project-focus__value--empty">
          {isArchived
            ? "No focus was recorded for this project."
            : "Name the outcome you are pursuing so this project stays pointed."}
        </p>
      )}
    </section>
  );
}

/* --- Workspace shell -------------------------------------------------------
   A project opens into a persistent header plus a compact section navigation.
   The header owns identity and the secondary options menu; each destination
   composes the components that already exist, so no behavior is duplicated.
   -------------------------------------------------------------------------- */

type WorkspaceSectionId = "overview" | "tasks" | "notes" | "decisions" | "context";

const WORKSPACE_SECTIONS: { id: WorkspaceSectionId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "tasks", label: "Tasks" },
  { id: "notes", label: "Notes" },
  { id: "decisions", label: "Decisions" },
  { id: "context", label: "Context" },
];

/**
 * A deep-link target names the item it points at, which also names the
 * workspace section that contains it. Unrecognized targets open the Overview.
 */
function sectionForTarget(targetId?: string): WorkspaceSectionId {
  if (!targetId) return "overview";
  if (targetId.startsWith("project-note-")) return "notes";
  if (targetId.startsWith("project-decision-")) return "decisions";
  if (targetId.startsWith("project-action-")) return "tasks";
  if (targetId === "project-resume-note") return "context";
  return "overview";
}

/** Switching workspace sections starts reading from the top of the canvas. */
function scrollToWorkspaceTop() {
  window.setTimeout(() => {
    document.querySelector<HTMLElement>(".canvas")?.scrollTo({ top: 0 });
  }, 0);
}

function WorkspaceNav({
  section,
  counts,
  onChange,
}: {
  section: WorkspaceSectionId;
  counts: Record<WorkspaceSectionId, number>;
  onChange: (section: WorkspaceSectionId) => void;
}) {
  return (
    <nav className="workspace-nav" aria-label="Project sections">
      {WORKSPACE_SECTIONS.map((candidate) => {
        const active = candidate.id === section;
        const count = counts[candidate.id];
        return (
          <button
            key={candidate.id}
            type="button"
            className={
              active
                ? "workspace-nav__link workspace-nav__link--active"
                : "workspace-nav__link"
            }
            aria-current={active ? "page" : undefined}
            onClick={() => onChange(candidate.id)}
          >
            {candidate.label}
            {count > 0 && <span className="workspace-nav__count">{count}</span>}
          </button>
        );
      })}
    </nav>
  );
}

const OVERVIEW_PREVIEW_LIMIT = 3;
const OVERVIEW_CONTEXT_LIMIT = 2;

/**
 * The project's current state: what it is pointed at, the next work waiting,
 * and the newest context worth rereading. Every value is drawn from records
 * the user already made; nothing is inferred or summarized.
 */
function ProjectOverview({
  project,
  projects,
  actions,
  todayDate,
  onGoToTasks,
  onAddTask,
  onGoToContext,
  onJump,
}: {
  project: Project;
  projects: ProjectsController;
  actions: ActionsController;
  todayDate: string;
  onGoToTasks: () => void;
  onAddTask: () => void;
  onGoToContext: () => void;
  onJump: (targetId: string) => void;
}) {
  const nextTitleId = useId();
  const contextTitleId = useId();
  const isArchived = project.status === "archived";

  const openActions = useMemo(
    () =>
      actions.actions.filter(
        (action) => action.projectId === project.id && action.status === "open",
      ),
    [actions.actions, project.id],
  );

  // The preview is ordered the same way the project chooses one next action:
  // selectNextOpenAction repeatedly, so the first three rows are the three the
  // project itself would rank first.
  const preview = useMemo(() => {
    const picked: Action[] = [];
    let remaining = [...openActions];
    while (picked.length < OVERVIEW_PREVIEW_LIMIT && remaining.length > 0) {
      const choice = selectNextOpenAction(remaining, todayDate);
      if (!choice) break;
      picked.push(choice.action);
      remaining = remaining.filter((candidate) => candidate.id !== choice.action.id);
    }
    return picked;
  }, [openActions, todayDate]);

  const latestDecision = useMemo(
    () => sortContextItems(project.decisions)[0],
    [project.decisions],
  );
  const latestNote = useMemo(() => sortContextItems(project.notes)[0], [project.notes]);

  const recentLinks = useMemo(() => {
    const candidates = [
      latestDecision
        ? {
            id: latestDecision.id,
            kind: "Decision",
            text: latestDecision.statement,
            at: latestDecision.updatedAt,
            targetId: `project-decision-${latestDecision.id}`,
          }
        : undefined,
      latestNote
        ? {
            id: latestNote.id,
            kind: "Note",
            text: latestNote.title,
            at: latestNote.updatedAt,
            targetId: `project-note-${latestNote.id}`,
          }
        : undefined,
    ].filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));

    return candidates
      .sort((left, right) => right.at.localeCompare(left.at) || left.id.localeCompare(right.id))
      .slice(0, OVERVIEW_CONTEXT_LIMIT)
      .map(
        (candidate): ContextLink => ({
          key: `${candidate.kind.toLowerCase()}:${candidate.id}`,
          kind: candidate.kind,
          text: candidate.text,
          meta: formatRelativeProjectDate(candidate.at),
          targetId: candidate.targetId,
          ariaLabel: `Go to ${candidate.kind.toLowerCase()}: ${candidate.text} (updated ${formatRelativeProjectDate(candidate.at)})`,
        }),
      );
  }, [latestDecision, latestNote]);

  return (
    <div className="project-overview">
      <ProjectFocus project={project} projects={projects} />

      <section className="project-overview__next" aria-labelledby={nextTitleId}>
        <div className="project-overview__heading">
          <h2 id={nextTitleId} className="project-overview__heading-title">
            Next up
          </h2>
          {openActions.length > 0 && (
            <button type="button" className="context-action" onClick={onGoToTasks}>
              View all tasks
            </button>
          )}
        </div>
        {preview.length > 0 ? (
          <ul className="action-list project-overview__list">
            {preview.map((action) => (
              <ActionRow
                key={action.id}
                action={action}
                actions={actions}
                projects={projects.projects}
                todayDate={todayDate}
                anchorId={`project-action-${action.id}`}
              />
            ))}
          </ul>
        ) : (
          <p className="project-overview__empty">
            {isArchived
              ? "This archived project has no open actions."
              : "No open actions yet. Add one to give this project a next step."}
          </p>
        )}
        {!isArchived && (
          <button
            type="button"
            className="context-action project-overview__add-task"
            onClick={onAddTask}
          >
            <PlusIcon aria-hidden="true" />
            <span>Add a task</span>
          </button>
        )}
      </section>

      <section className="project-overview__context" aria-labelledby={contextTitleId}>
        <div className="project-overview__heading">
          <h2 id={contextTitleId} className="project-overview__heading-title">
            Recent context
          </h2>
          <button type="button" className="context-action" onClick={onGoToContext}>
            All context
          </button>
        </div>
        {recentLinks.length > 0 ? (
          <ContextLinks links={recentLinks} onJump={onJump} leadingTitle />
        ) : (
          <p className="project-overview__empty">No notes or decisions recorded yet.</p>
        )}
      </section>
    </div>
  );
}


function ProjectResume({
  project,
  projects,
  actions,
  nextChoice,
  actionFormInputId,
  onJump,
}: {
  project: Project;
  projects: ProjectsController;
  actions: ActionsController;
  nextChoice?: NextActionChoice;
  actionFormInputId: string;
  onJump: (targetId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.resume?.note ?? "");
  const [error, setError] = useState<string>();
  const titleId = useId();
  const inputId = useId();
  const errorId = useId();
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const isArchived = project.status === "archived";
  const todayDate = todayKey();
  const latestDecision = useMemo(
    () => sortContextItems(project.decisions)[0],
    [project.decisions],
  );
  const latestNote = useMemo(() => sortContextItems(project.notes)[0], [project.notes]);

  const rememberLinks: ContextLink[] = [];
  if (latestDecision) {
    rememberLinks.push({
      key: `decision:${latestDecision.id}`,
      kind: "Decision",
      text: latestDecision.statement,
      meta: formatRelativeProjectDate(latestDecision.updatedAt),
      targetId: `project-decision-${latestDecision.id}`,
      ariaLabel: `Go to decision: ${latestDecision.statement} (updated ${formatRelativeProjectDate(latestDecision.updatedAt)})`,
    });
  }
  if (latestNote) {
    rememberLinks.push({
      key: `note:${latestNote.id}`,
      kind: "Note",
      text: latestNote.title,
      meta: formatRelativeProjectDate(latestNote.updatedAt),
      targetId: `project-note-${latestNote.id}`,
      ariaLabel: `Go to note: ${latestNote.title} (updated ${formatRelativeProjectDate(latestNote.updatedAt)})`,
    });
  }

  function beginEdit() {
    setDraft(project.resume?.note ?? "");
    setError(undefined);
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(project.resume?.note ?? "");
    setError(undefined);
    setEditing(false);
    window.setTimeout(() => editButtonRef.current?.focus(), 0);
  }

  function save() {
    const result = projects.updateProjectResume(project.id, draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setDraft(result.project.resume?.note ?? "");
    setError(undefined);
    setEditing(false);
    window.setTimeout(() => editButtonRef.current?.focus(), 0);
  }

  function focusActionForm() {
    const input = document.getElementById(actionFormInputId);
    if (!input) return;
    input.scrollIntoView({ block: "center", behavior: "auto" });
    input.focus({ preventScroll: true });
  }

  return (
    <section className="project-resume" aria-labelledby={titleId}>
      <h2 id={titleId} className="project-resume__title">
        Resume
      </h2>
      <p className="project-resume__intro">
        Your own note about where you stopped, paired with the next action from this
        project’s open work.
      </p>
      {isArchived && (
        <p className="project-resume__archived">
          This project is archived. Restore it to change the resume note.
        </p>
      )}

      <div className="project-resume__block">
        <div className="project-resume__block-heading">
          <h3 className="project-resume__block-title">
            Where I left off
            <span className="project-resume__provenance">Written by you</span>
          </h3>
          {!isArchived && !editing && (
            <button
              ref={editButtonRef}
              type="button"
              className="context-action"
              onClick={beginEdit}
            >
              <EditIcon aria-hidden="true" />
              <span>{project.resume ? "Edit note" : "Add note"}</span>
            </button>
          )}
        </div>

        {editing ? (
          <>
            <label className="visually-hidden" htmlFor={inputId}>
              Where I left off
            </label>
            <textarea
              id={inputId}
              className="project-detail__textarea project-resume__textarea"
              value={draft}
              autoFocus
              placeholder="A sentence about where you stopped and what comes next."
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => {
                setDraft(event.target.value);
                if (error) setError(undefined);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelEdit();
                } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  save();
                }
              }}
            />
            <div className="project-detail__edit-actions">
              <button type="button" className="action-button" onClick={cancelEdit}>
                Cancel
              </button>
              <button
                type="button"
                className="action-button action-button--primary"
                onClick={save}
              >
                Save note
              </button>
            </div>
            {error && (
              <p id={errorId} className="project-detail__error" role="alert">
                {error}
              </p>
            )}
          </>
        ) : project.resume ? (
          <>
            <p id="project-resume-note" tabIndex={-1} className="project-resume__note">
              {project.resume.note}
            </p>
            <p className="project-resume__meta">{formatResumeMeta(project.resume)}</p>
          </>
        ) : (
          <p className="project-resume__empty">
            {isArchived
              ? "No resume note was recorded for this project."
              : "No note yet. Write a line about where you stopped so returning takes less time."}
          </p>
        )}
      </div>

      <div className="project-resume__block">
        <div className="project-resume__block-heading">
          <h3 className="project-resume__block-title">
            Next action
            <span className="project-resume__provenance">From open actions</span>
          </h3>
        </div>
        {nextChoice ? (
          <>
            <p className="project-resume__reason">{nextChoice.reason}</p>
            <ul className="action-list project-resume__action-list">
              <ActionRow
                key={nextChoice.action.id}
                action={nextChoice.action}
                actions={actions}
                projects={projects.projects}
                todayDate={todayDate}
                anchorId={`project-action-${nextChoice.action.id}`}
              />
            </ul>
          </>
        ) : (
          <>
            <p className="project-resume__empty">
              {isArchived
                ? "No open actions."
                : "No open actions yet. Add one to give this project a next step."}
            </p>
            {!isArchived && (
              <button
                type="button"
                className="context-action project-resume__add-action"
                onClick={focusActionForm}
              >
                <PlusIcon aria-hidden="true" />
                <span>Add an action</span>
              </button>
            )}
          </>
        )}
      </div>

      <div className="project-resume__block">
        <div className="project-resume__block-heading">
          <h3 className="project-resume__block-title">Worth remembering</h3>
        </div>
        {rememberLinks.length > 0 ? (
          <ContextLinks links={rememberLinks} onJump={onJump} />
        ) : (
          <p className="project-resume__empty">No decisions or notes recorded yet.</p>
        )}
      </div>
    </section>
  );
}

function NoteForm({
  initialTitle = "",
  initialContent = "",
  submitLabel,
  onSave,
  onCancel,
}: {
  initialTitle?: string;
  initialContent?: string;
  submitLabel: string;
  onSave: (title: string, content: string) => string | undefined;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [error, setError] = useState<string>();
  const fieldId = useId();
  const errorId = useId();
  const titleRef = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextError = onSave(title, content);
    if (nextError) {
      setError(nextError);
      titleRef.current?.focus();
      titleRef.current?.select();
    }
  }

  return (
    <form
      className="context-form"
      onSubmit={submit}
      noValidate
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          event.currentTarget.requestSubmit();
        }
      }}
    >
      <div className="context-form__field">
        <label className="context-form__label" htmlFor={`${fieldId}-title`}>
          Note title
        </label>
        <input
          ref={titleRef}
          id={`${fieldId}-title`}
          className="context-form__input"
          value={title}
          autoFocus
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => {
            setTitle(event.target.value);
            if (error) setError(undefined);
          }}
        />
      </div>
      <div className="context-form__field">
        <label className="context-form__label" htmlFor={`${fieldId}-content`}>
          Note
        </label>
        <textarea
          id={`${fieldId}-content`}
          className="context-form__textarea"
          value={content}
          placeholder="What is worth remembering?"
          onChange={(event) => {
            setContent(event.target.value);
            if (error) setError(undefined);
          }}
        />
      </div>
      {error && (
        <p id={errorId} className="context-form__error" role="alert">
          {error}
        </p>
      )}
      <div className="context-form__actions">
        <button type="button" className="action-button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="action-button action-button--primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function DecisionForm({
  initialStatement = "",
  initialRationale = "",
  submitLabel,
  onSave,
  onCancel,
}: {
  initialStatement?: string;
  initialRationale?: string;
  submitLabel: string;
  onSave: (statement: string, rationale: string) => string | undefined;
  onCancel: () => void;
}) {
  const [statement, setStatement] = useState(initialStatement);
  const [rationale, setRationale] = useState(initialRationale);
  const [error, setError] = useState<string>();
  const fieldId = useId();
  const errorId = useId();
  const statementRef = useRef<HTMLTextAreaElement>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextError = onSave(statement, rationale);
    if (nextError) {
      setError(nextError);
      statementRef.current?.focus();
      statementRef.current?.select();
    }
  }

  return (
    <form
      className="context-form"
      onSubmit={submit}
      noValidate
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          event.currentTarget.requestSubmit();
        }
      }}
    >
      <div className="context-form__field">
        <label className="context-form__label" htmlFor={`${fieldId}-statement`}>
          Decision
        </label>
        <textarea
          ref={statementRef}
          id={`${fieldId}-statement`}
          className="context-form__textarea context-form__textarea--statement"
          value={statement}
          autoFocus
          placeholder="What was decided?"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            setStatement(event.target.value);
            if (error) setError(undefined);
          }}
        />
      </div>
      <div className="context-form__field">
        <label className="context-form__label" htmlFor={`${fieldId}-rationale`}>
          Why
        </label>
        <textarea
          id={`${fieldId}-rationale`}
          className="context-form__textarea"
          value={rationale}
          placeholder="What makes this the right choice?"
          onChange={(event) => {
            setRationale(event.target.value);
            if (error) setError(undefined);
          }}
        />
      </div>
      {error && (
        <p id={errorId} className="context-form__error" role="alert">
          {error}
        </p>
      )}
      <div className="context-form__actions">
        <button type="button" className="action-button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="action-button action-button--primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function NoteItem({
  note,
  project,
  projects,
  isArchived,
  onRemoved,
}: {
  note: ProjectNote;
  project: Project;
  projects: ProjectsController;
  isArchived: boolean;
  onRemoved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string>();
  const itemRef = useRef<HTMLLIElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const confirm = useConfirm();

  function save(title: string, content: string): string | undefined {
    const result = projects.updateNote(project.id, note.id, title, content);
    if (!result.ok) return result.error;

    setError(undefined);
    setEditing(false);
    window.setTimeout(() => editButtonRef.current?.focus(), 0);
    return undefined;
  }

  function cancel() {
    setError(undefined);
    setEditing(false);
    window.setTimeout(() => editButtonRef.current?.focus(), 0);
  }

  return (
    <li
      ref={itemRef}
      id={`project-note-${note.id}`}
      tabIndex={-1}
      className="context-item"
    >
      {editing ? (
        <NoteForm
          initialTitle={note.title}
          initialContent={note.content}
          submitLabel="Save note"
          onSave={save}
          onCancel={cancel}
        />
      ) : (
        <>
          <div className="context-item__heading">
            <h4 className="context-item__title">{note.title}</h4>
            {!isArchived && (
              <div className="context-item__operations">
                <button
                  ref={editButtonRef}
                  type="button"
                  className="action-icon-button"
                  title="Edit note"
                  aria-label={`Edit note ${note.title} in ${project.name}`}
                  onClick={() => {
                    setError(undefined);
                    setEditing(true);
                  }}
                >
                  <EditIcon aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="action-icon-button action-icon-button--quiet"
                  title="Delete note"
                  aria-label={`Delete note ${note.title} in ${project.name}`}
                  onClick={(event) => {
                    const row = itemRef.current;
                    confirm({
                      title: "Delete note?",
                      description: `“${note.title}” will be removed from ${project.name}. This cannot be undone.`,
                      confirmLabel: "Delete",
                      trigger: event.currentTarget,
                      onConfirm: () => {
                        const result = projects.deleteNote(project.id, note.id);
                        if (!result.ok) {
                          setError(result.error);
                          return;
                        }
                        focusAfterContextRemoval(row, onRemoved);
                      },
                    });
                  }}
                >
                  <TrashIcon aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
          {note.content && <p className="context-item__body">{note.content}</p>}
          <p className="context-item__meta">{formatContextMeta("Note", note)}</p>
          {error && (
            <p className="project-detail__error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </li>
  );
}

function DecisionItem({
  decision,
  project,
  projects,
  isArchived,
  onRemoved,
}: {
  decision: ProjectDecision;
  project: Project;
  projects: ProjectsController;
  isArchived: boolean;
  onRemoved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string>();
  const itemRef = useRef<HTMLLIElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const confirm = useConfirm();

  function save(statement: string, rationale: string): string | undefined {
    const result = projects.updateDecision(project.id, decision.id, statement, rationale);
    if (!result.ok) return result.error;

    setError(undefined);
    setEditing(false);
    window.setTimeout(() => editButtonRef.current?.focus(), 0);
    return undefined;
  }

  function cancel() {
    setError(undefined);
    setEditing(false);
    window.setTimeout(() => editButtonRef.current?.focus(), 0);
  }

  return (
    <li
      ref={itemRef}
      id={`project-decision-${decision.id}`}
      tabIndex={-1}
      className="context-item"
    >
      {editing ? (
        <DecisionForm
          initialStatement={decision.statement}
          initialRationale={decision.rationale}
          submitLabel="Save decision"
          onSave={save}
          onCancel={cancel}
        />
      ) : (
        <>
          <div className="context-item__heading">
            <h4 className="context-item__title">{decision.statement}</h4>
            {!isArchived && (
              <div className="context-item__operations">
                <button
                  ref={editButtonRef}
                  type="button"
                  className="action-icon-button"
                  title="Edit decision"
                  aria-label={`Edit decision ${decision.statement} in ${project.name}`}
                  onClick={() => {
                    setError(undefined);
                    setEditing(true);
                  }}
                >
                  <EditIcon aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="action-icon-button action-icon-button--quiet"
                  title="Delete decision"
                  aria-label={`Delete decision ${decision.statement} in ${project.name}`}
                  onClick={(event) => {
                    const row = itemRef.current;
                    confirm({
                      title: "Delete decision?",
                      description: `“${decision.statement}” and its reasoning will be removed from ${project.name}. This cannot be undone.`,
                      confirmLabel: "Delete",
                      trigger: event.currentTarget,
                      onConfirm: () => {
                        const result = projects.deleteDecision(project.id, decision.id);
                        if (!result.ok) {
                          setError(result.error);
                          return;
                        }
                        focusAfterContextRemoval(row, onRemoved);
                      },
                    });
                  }}
                >
                  <TrashIcon aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
          <div className="context-item__why">
            <span className="context-item__label">Why</span>
            <p
              className={
                decision.rationale
                  ? "context-item__body"
                  : "context-item__body context-item__body--empty"
              }
            >
              {decision.rationale || "No rationale was recorded."}
            </p>
          </div>
          <p className="context-item__meta">{formatContextMeta("Decision", decision)}</p>
          {error && (
            <p className="project-detail__error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </li>
  );
}

function ProjectNotes({
  project,
  projects,
  revealId,
  onRevealHandled,
}: {
  project: Project;
  projects: ProjectsController;
  revealId?: string;
  onRevealHandled?: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const titleId = useId();
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const isArchived = project.status === "archived";
  const notes = useMemo(() => sortContextItems(project.notes), [project.notes]);
  const visibleNotes = showAll ? notes : notes.slice(0, RECENT_CONTEXT_LIMIT);

  useEffect(() => {
    // A link from activity or Resume may point at a note that is collapsed.
    // The request is handled once — expanding, if needed — and then cleared so
    // plain navigation to this section never inherits a stale reveal.
    if (!revealId?.startsWith("project-note-")) return;
    if (!document.getElementById(revealId)) setShowAll(true);
    onRevealHandled?.();
  }, [revealId, onRevealHandled]);

  function focusAddButton() {
    addButtonRef.current?.focus();
  }

  function closeCreate() {
    setCreating(false);
    window.setTimeout(focusAddButton, 0);
  }

  return (
    <section className="context-section" aria-labelledby={titleId}>
      <div className="context-section__heading">
        <h3 id={titleId} className="context-section__title">
          Notes
          <span className="context-section__count">{notes.length}</span>
        </h3>
        {!isArchived && !creating && (
          <button
            ref={addButtonRef}
            type="button"
            className="context-action"
            onClick={() => setCreating(true)}
          >
            <PlusIcon aria-hidden="true" />
            <span>Add note</span>
          </button>
        )}
      </div>

      {creating && (
        <NoteForm
          submitLabel="Add note"
          onSave={(title, content) => {
            const result = projects.addNote(project.id, title, content);
            if (!result.ok) return result.error;
            closeCreate();
            return undefined;
          }}
          onCancel={closeCreate}
        />
      )}

      {!creating && notes.length === 0 && (
        <p className="context-section__empty">
          {isArchived
            ? "This project has no notes."
            : "No notes yet. Write down what you learn so it survives the next interruption."}
        </p>
      )}

      {notes.length > 0 && (
        <>
          <ul className="context-list">
            {visibleNotes.map((note) => (
              <NoteItem
                key={note.id}
                note={note}
                project={project}
                projects={projects}
                isArchived={isArchived}
                onRemoved={focusAddButton}
              />
            ))}
          </ul>
          {notes.length > RECENT_CONTEXT_LIMIT && (
            <button
              type="button"
              className="context-more"
              aria-expanded={showAll}
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll ? "Show recent" : `Show all ${notes.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function ProjectDecisions({
  project,
  projects,
  revealId,
  onRevealHandled,
}: {
  project: Project;
  projects: ProjectsController;
  revealId?: string;
  onRevealHandled?: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const titleId = useId();
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const isArchived = project.status === "archived";
  const decisions = useMemo(() => sortContextItems(project.decisions), [project.decisions]);
  const visibleDecisions = showAll ? decisions : decisions.slice(0, RECENT_CONTEXT_LIMIT);

  useEffect(() => {
    // A link from activity or Resume may point at a decision that is collapsed.
    // Handled once, then cleared the same way as Notes above.
    if (!revealId?.startsWith("project-decision-")) return;
    if (!document.getElementById(revealId)) setShowAll(true);
    onRevealHandled?.();
  }, [revealId, onRevealHandled]);

  function focusAddButton() {
    addButtonRef.current?.focus();
  }

  function closeCreate() {
    setCreating(false);
    window.setTimeout(focusAddButton, 0);
  }

  return (
    <section className="context-section" aria-labelledby={titleId}>
      <div className="context-section__heading">
        <h3 id={titleId} className="context-section__title">
          Decisions
          <span className="context-section__count">{decisions.length}</span>
        </h3>
        {!isArchived && !creating && (
          <button
            ref={addButtonRef}
            type="button"
            className="context-action"
            onClick={() => setCreating(true)}
          >
            <PlusIcon aria-hidden="true" />
            <span>Add decision</span>
          </button>
        )}
      </div>

      {creating && (
        <DecisionForm
          submitLabel="Add decision"
          onSave={(statement, rationale) => {
            const result = projects.addDecision(project.id, statement, rationale);
            if (!result.ok) return result.error;
            closeCreate();
            return undefined;
          }}
          onCancel={closeCreate}
        />
      )}

      {!creating && decisions.length === 0 && (
        <p className="context-section__empty">
          {isArchived
            ? "This project has no decisions."
            : "No decisions yet. Record what you chose and why, so you do not relitigate it later."}
        </p>
      )}

      {decisions.length > 0 && (
        <>
          <ul className="context-list">
            {visibleDecisions.map((decision) => (
              <DecisionItem
                key={decision.id}
                decision={decision}
                project={project}
                projects={projects}
                isArchived={isArchived}
                onRemoved={focusAddButton}
              />
            ))}
          </ul>
          {decisions.length > RECENT_CONTEXT_LIMIT && (
            <button
              type="button"
              className="context-more"
              aria-expanded={showAll}
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll ? "Show recent" : `Show all ${decisions.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function ProjectBackground({
  project,
  onEdit,
}: {
  project: Project;
  /** Opens the shared project edit flow; that form owns the description. */
  onEdit: () => void;
}) {
  const titleId = useId();
  return (
    <section className="project-background" aria-labelledby={titleId}>
      <div className="project-overview__heading">
        <h2 id={titleId} className="project-overview__heading-title">
          Background
        </h2>
        <button type="button" className="context-action" onClick={onEdit}>
          <EditIcon aria-hidden="true" />
          <span>{project.description ? "Edit description" : "Add description"}</span>
        </button>
      </div>
      {project.description ? (
        <p className="project-detail__description project-background__text">
          {project.description}
        </p>
      ) : (
        <p className="project-overview__empty">
          No description yet. Add what this project is for, and why it exists.
        </p>
      )}
    </section>
  );
}

function ProjectActivity({
  project,
  actions,
  onJump,
}: {
  project: Project;
  actions: Action[];
  onJump: (targetId: string) => void;
}) {
  const titleId = useId();
  const entries = useMemo(() => buildProjectActivity(project, actions), [project, actions]);
  const links = entries.map(activityLink);

  return (
    <section className="project-activity" aria-labelledby={titleId}>
      <h2 id={titleId} className="project-activity__title">
        Recent activity
      </h2>
      <p className="project-activity__intro">
        What changed in this project and its work, newest first. Your resume note stays
        in your own words above.
      </p>
      {links.length > 0 ? (
        <ContextLinks links={links} onJump={onJump} />
      ) : (
        <p className="project-activity__empty">
          No activity recorded yet. Adding an action, note, or decision will appear here.
        </p>
      )}
    </section>
  );
}

function editableProjectFields(project: Project): ProjectEditableFields {
  return {
    name: project.name,
    description: project.description ?? "",
    currentFocus: project.currentFocus ?? "",
    resume: project.resume?.note ?? "",
  };
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function naturalList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/**
 * The confirmation has to be honest about the two different fates: the
 * project-owned history is destroyed, while linked actions survive and become
 * unlinked. Saying both plainly is what makes Delete distinct from Archive.
 */
function describeProjectDeletion(project: Project, linkedActionCount: number): string {
  const removed: string[] = [];
  if (project.notes.length > 0) removed.push(plural(project.notes.length, "note"));
  if (project.decisions.length > 0) removed.push(plural(project.decisions.length, "decision"));
  if (project.resume) removed.push("the resume note");

  const history =
    removed.length > 0
      ? `${naturalList(removed)} will be deleted with it.`
      : "It has no notes, decisions, or resume note.";
  const actions =
    linkedActionCount > 0
      ? `${plural(linkedActionCount, "linked action")} will be kept in Actions and unlinked from the project.`
      : "No actions are linked to it.";

  return `“${project.name}” will be permanently deleted. ${history} ${actions} This cannot be undone; archive the project instead if you may want it later.`;
}

/**
 * One menu body for both surfaces that manage a project — the workspace
 * header and the Projects index row. Sharing it keeps the actions, their
 * order, and their labels identical, so neither menu can drift.
 */
function ProjectMenuActions({
  isArchived,
  close,
  onEdit,
  onToggleArchive,
  onDelete,
}: {
  isArchived: boolean;
  close: (restoreFocus?: boolean) => void;
  onEdit: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="menu-list">
      <button
        type="button"
        className="menu-option"
        onClick={() => {
          close();
          onEdit();
        }}
      >
        <span className="menu-option__label">Edit</span>
      </button>
      <button
        type="button"
        className="menu-option"
        onClick={() => {
          close();
          onToggleArchive();
        }}
      >
        <span className="menu-option__label">
          {isArchived ? "Restore" : "Archive"}
        </span>
      </button>
      <button
        type="button"
        className="menu-option menu-option--delete"
        onClick={() => {
          // The confirmation dialog takes over from here.
          close(false);
          onDelete();
        }}
      >
        <span className="menu-option__label">Delete</span>
      </button>
    </div>
  );
}

type ProjectDeleteRequest = (
  project: Project,
  trigger: HTMLElement | null,
  onResult: (result: ProjectMutationResult) => void,
) => void;

/**
 * One delete request for every surface that manages a project: the workspace
 * header and the Projects index row both run this, so the confirmation copy,
 * the delete-then-detach ordering, and the failure reporting stay a single
 * operation rather than two subtly different versions. A failed delete is
 * reported through the caller and the controller's storage warning.
 */
function useProjectDelete(
  projects: ProjectsController,
  actions: ActionsController,
): ProjectDeleteRequest {
  const confirm = useConfirm();
  return (project, trigger, onResult) => {
    const linkedActionCount = actions.actions.filter(
      (action) => action.projectId === project.id,
    ).length;

    confirm({
      title: "Delete project?",
      description: describeProjectDeletion(project, linkedActionCount),
      confirmLabel: "Delete project",
      trigger,
      onConfirm: () => {
        const result = projects.deleteProject(project.id);
        if (result.ok) {
          // Actions are preserved, but a reference to a project that no longer
          // exists would strand them in an unexplained "unavailable" state.
          actions.detachProject(project.id);
        }
        onResult(result);
      },
    });
  };
}

function ProjectDetail({
  project,
  projects,
  actions,
  onBack,
  initialTargetId,
  backLabel = "Projects",
  initialEdit,
  requestProjectDelete,
}: {
  project: Project;
  projects: ProjectsController;
  actions: ActionsController;
  onBack: () => void;
  /** An item inside this project to reveal and focus once it has opened. */
  initialTargetId?: string;
  /** Where the back button returns to, named for the user. */
  backLabel?: string;
  /** Opens the project straight into its shared edit form. */
  initialEdit?: boolean;
  requestProjectDelete: ProjectDeleteRequest;
}) {
  const [editingDetails, setEditingDetails] = useState(() => initialEdit === true);
  const [detailsDraft, setDetailsDraft] = useState<ProjectEditableFields>(() =>
    editableProjectFields(project),
  );
  const [detailsError, setDetailsError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [revealId, setRevealId] = useState<string>();
  // The workspace destination, seeded from any deep-link target the project
  // was opened with, so a link to a note lands inside Notes, not Overview.
  const [section, setSection] = useState<WorkspaceSectionId>(() =>
    sectionForTarget(initialTargetId),
  );
  const titleRef = useRef<HTMLHeadingElement>(null);
  const detailsNameRef = useRef<HTMLInputElement>(null);
  const editTitleId = useId();
  const editErrorId = useId();
  const editNameId = useId();
  const editDescriptionId = useId();
  const editFocusId = useId();
  const editResumeId = useId();
  const actionFormInputId = useId();
  const todayDate = todayKey();
  const lastActivityAt = projectLastActivityAt(project, actions.actions);
  const nextChoice = useMemo(
    () =>
      selectNextOpenAction(
        actions.actions.filter((action) => action.projectId === project.id),
        todayDate,
      ),
    [actions.actions, project.id, todayDate],
  );
  const openActionCount = useMemo(
    () =>
      actions.actions.filter(
        (action) => action.projectId === project.id && action.status === "open",
      ).length,
    [actions.actions, project.id],
  );
  const navCounts: Record<WorkspaceSectionId, number> = {
    overview: 0,
    tasks: openActionCount,
    notes: project.notes.length,
    decisions: project.decisions.length,
    context: 0,
  };
  // Project edits and action detachment write to separate stores, but they
  // report the same failure. Show one warning per distinct message.
  const storageMessages = useMemo(() => {
    const messages = [projects.storageError, actions.storageError].filter(
      (message): message is string => Boolean(message),
    );
    return Array.from(new Set(messages));
  }, [projects.storageError, actions.storageError]);

  useEffect(() => {
    // Land on the project title when the detail opens so the next Tab reaches
    // the project controls.
    titleRef.current?.focus();
  }, [project.id]);

  useEffect(() => {
    // A project opened from elsewhere with a target reveals and focuses that
    // item, in the workspace section that contains it. It runs after the title
    // focus above so the target wins.
    if (!initialTargetId) return;
    setSection(sectionForTarget(initialTargetId));
    jumpTo(initialTargetId);
    // The jump belongs to the project that was opened, not to every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTargetId]);

  useEffect(() => {
    // An edit intent runs beginEditDetails' focus hand-off even though the
    // form is already open from the seeded state, so the caret lands in the
    // name field as it does when the header menu opens it.
    if (!initialEdit) return;
    const focusTimer = window.setTimeout(() => {
      detailsNameRef.current?.focus();
      detailsNameRef.current?.select();
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [initialEdit]);

  const isArchived = project.status === "archived";

  function goToSection(next: WorkspaceSectionId) {
    setSection(next);
    scrollToWorkspaceTop();
  }

  /**
   * A link that points inside the project: switch to the section that owns the
   * target first, then let the shared reveal-and-focus mechanism place the
   * reader exactly on the item the link named.
   */
  function jumpToTarget(targetId: string) {
    goToSection(sectionForTarget(targetId));
    setRevealId(targetId);
    focusWhenAvailable(targetId);
  }

  function goToTasks(formFocusId?: string) {
    goToSection("tasks");
    // The task form lives in the Tasks section, so it does not exist until the
    // switch renders; the same retry helper as deep links covers that gap.
    if (formFocusId) focusWhenAvailable(formFocusId, 8);
  }

  function focusMenuTrigger() {
    window.setTimeout(() => {
      document
        .querySelector<HTMLButtonElement>(".project-detail__menu-trigger")
        ?.focus();
    }, 0);
  }

  // A reveal request is consumed by the section that handled it.
  function clearRevealId() {
    setRevealId(undefined);
  }
  function beginEditDetails() {
    setDetailsDraft(editableProjectFields(project));
    setDetailsError(undefined);
    setEditingDetails(true);
    window.setTimeout(() => {
      detailsNameRef.current?.focus();
      detailsNameRef.current?.select();
    }, 0);
  }

  function saveDetails() {
    const result = projects.updateProject(project.id, detailsDraft);
    if (!result.ok) {
      setDetailsError(result.error);
      detailsNameRef.current?.focus();
      detailsNameRef.current?.select();
      return;
    }

    setDetailsDraft(editableProjectFields(result.project));
    setDetailsError(undefined);
    setEditingDetails(false);
    // The header options menu reappears after the form closes; landing focus
    // there keeps the next Tab predictable after an edit.
    focusMenuTrigger();
  }

  function cancelEditDetails() {
    setDetailsDraft(editableProjectFields(project));
    setDetailsError(undefined);
    setEditingDetails(false);
    focusMenuTrigger();
  }

  function toggleArchive() {
    const result = isArchived
      ? projects.restoreProject(project.id)
      : projects.archiveProject(project.id);
    setActionError(result.ok ? undefined : result.error);
  }

  function requestDelete() {
    // The confirmation lives in useProjectDelete so the index row menu runs
    // exactly the same flow; here only the focus target differs.
    requestProjectDelete(
      project,
      document.querySelector<HTMLButtonElement>(".project-detail__menu-trigger"),
      (result) => {
        if (!result.ok) {
          setActionError(result.error);
          return;
        }
        onBack();
      },
    );
  }

  function jumpTo(targetId: string) {
    setRevealId(targetId);
    focusWhenAvailable(targetId);
  }

  return (
    <div className="project-detail">
      <button type="button" className="project-detail__back" onClick={onBack}>
        <ArrowLeft aria-hidden="true" />
        <span>{backLabel}</span>
      </button>

      <div className="project-detail__identity">
        <div className="project-detail__title-group">
          <h1 ref={titleRef} tabIndex={-1} className="canvas__title project-detail__title">
            {project.name}
          </h1>

          {project.description && (
            <p className="project-detail__description">{project.description}</p>
          )}

          <div className="project-detail__meta">
            <span>Created {formatProjectDate(project.createdAt)}</span>
            <span aria-hidden="true">·</span>
            <span>Updated {formatRelativeProjectDate(lastActivityAt)}</span>
            {isArchived && (
              <>
                <span aria-hidden="true">·</span>
                <span className="project-detail__status">Archived</span>
              </>
            )}
          </div>
        </div>

        {!editingDetails && (
          <div className="project-detail__operations">
            {/* Project-level management is secondary: one quiet overflow menu
                instead of a row of permanent buttons. */}
            <AnchoredPopover
              label={`Options for ${project.name}`}
              triggerLabel=""
              className="project-detail__menu-trigger"
              icon={<MoreHorizontal aria-hidden="true" />}
            >
              {(close) => (
                <ProjectMenuActions
                  isArchived={isArchived}
                  close={close}
                  onEdit={beginEditDetails}
                  onToggleArchive={toggleArchive}
                  onDelete={requestDelete}
                />
              )}
            </AnchoredPopover>
          </div>
        )}
      </div>

      {storageMessages.map((message) => (
        <p key={message} className="storage-warning" role="status">
          {message}
        </p>
      ))}

      {actionError && (
        <p className="project-detail__error" role="alert">
          {actionError}
        </p>
      )}

      {editingDetails ? (
        <form
          className="project-edit"
          aria-labelledby={editTitleId}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            saveDetails();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancelEditDetails();
            } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              saveDetails();
            }
          }}
        >
          <h2 id={editTitleId} className="project-edit__title">
            Edit project
          </h2>

          <div className="project-edit__field">
            <label className="context-form__label" htmlFor={editNameId}>
              Name
            </label>
            <input
              ref={detailsNameRef}
              id={editNameId}
              className="context-form__input project-edit__name"
              value={detailsDraft.name}
              autoComplete="off"
              aria-invalid={detailsError ? true : undefined}
              aria-describedby={detailsError ? editErrorId : undefined}
              onChange={(event) => {
                setDetailsDraft((draft) => ({ ...draft, name: event.target.value }));
                if (detailsError) setDetailsError(undefined);
              }}
            />
          </div>

          <div className="project-edit__field">
            <label className="context-form__label" htmlFor={editDescriptionId}>
              Description
            </label>
            <textarea
              id={editDescriptionId}
              className="context-form__textarea"
              value={detailsDraft.description}
              placeholder="What is this project for?"
              onChange={(event) =>
                setDetailsDraft((draft) => ({ ...draft, description: event.target.value }))
              }
            />
          </div>

          {!isArchived && (
            <>
              <div className="project-edit__field">
                <label className="context-form__label" htmlFor={editFocusId}>
                  Current focus
                </label>
                <textarea
                  id={editFocusId}
                  className="context-form__textarea project-edit__textarea--short"
                  value={detailsDraft.currentFocus}
                  placeholder="What deserves attention now?"
                  onChange={(event) =>
                    setDetailsDraft((draft) => ({ ...draft, currentFocus: event.target.value }))
                  }
                />
              </div>

              <div className="project-edit__field">
                <label className="context-form__label" htmlFor={editResumeId}>
                  Resume note
                </label>
                <textarea
                  id={editResumeId}
                  className="context-form__textarea"
                  value={detailsDraft.resume}
                  placeholder="Where things stand, and the next step."
                  onChange={(event) =>
                    setDetailsDraft((draft) => ({ ...draft, resume: event.target.value }))
                  }
                />
              </div>
            </>
          )}

          {detailsError && (
            <p id={editErrorId} className="context-form__error" role="alert">
              {detailsError}
            </p>
          )}

          <div className="project-edit__actions">
            <button type="button" className="action-button" onClick={cancelEditDetails}>
              Cancel
            </button>
            <button type="submit" className="action-button action-button--primary">
              Save changes
            </button>
          </div>
        </form>
      ) : (
        <>
          <WorkspaceNav section={section} counts={navCounts} onChange={goToSection} />

          {section === "overview" && (
            <ProjectOverview
              project={project}
              projects={projects}
              actions={actions}
              todayDate={todayDate}
              onGoToTasks={() => goToSection("tasks")}
              onAddTask={() => goToTasks(actionFormInputId)}
              onGoToContext={() => goToSection("context")}
              onJump={jumpToTarget}
            />
          )}

          {section === "tasks" && (
            <ProjectActions
              project={project}
              actions={actions}
              projects={projects.projects}
              nextActionId={nextChoice?.action.id}
              actionFormInputId={actionFormInputId}
            />
          )}

          {section === "notes" && (
            <ProjectNotes
              project={project}
              projects={projects}
              revealId={revealId}
              onRevealHandled={clearRevealId}
            />
          )}

          {section === "decisions" && (
            <ProjectDecisions
              project={project}
              projects={projects}
              revealId={revealId}
              onRevealHandled={clearRevealId}
            />
          )}

          {section === "context" && (
            <>
              <ProjectBackground project={project} onEdit={beginEditDetails} />

              <ProjectResume
                project={project}
                projects={projects}
                actions={actions}
                nextChoice={nextChoice}
                actionFormInputId={actionFormInputId}
                onJump={jumpToTarget}
              />

              <ProjectActivity project={project} actions={actions.actions} onJump={jumpToTarget} />
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * A project opened from another surface, such as Home. The optional target is
 * the DOM id of the item inside the project that should be revealed; the
 * optional intent says how the destination should open (the shared edit form).
 */
export interface ProjectOpenTarget {
  projectId: string;
  targetId?: string;
  intent?: ProjectOpenIntent;
}

export function ProjectsCanvas({
  projects,
  actions,
  openTarget,
  listResetToken = 0,
  onOpenTargetClosed,
}: {
  projects: ProjectsController;
  actions: ActionsController;
  /** A project opened from another surface, such as Home. */
  openTarget?: ProjectOpenTarget;
  /** Changes whenever the primary navigation asks for the Projects list. */
  listResetToken?: number;
  /** Called when the user leaves a project that was opened from elsewhere. */
  onOpenTargetClosed?: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | undefined>(
    () => openTarget?.projectId,
  );
  const [targetId, setTargetId] = useState<string | undefined>(() => openTarget?.targetId);
  const [openIntent, setOpenIntent] = useState<ProjectOpenIntent | undefined>(
    () => openTarget?.intent,
  );
  const [openedElsewhere, setOpenedElsewhere] = useState(() => Boolean(openTarget));
  const [filter, setFilter] = useState<ProjectFilter>("active");
  const selectedProject = selectedId
    ? projects.projects.find((project) => project.id === selectedId)
    : undefined;
  // One shared delete request for the row menus and the workspace header.
  const requestProjectDelete = useProjectDelete(projects, actions);

  useEffect(() => {
    if (!openTarget) return;
    setSelectedId(openTarget.projectId);
    setTargetId(openTarget.targetId);
    setOpenIntent(openTarget.intent);
    setOpenedElsewhere(true);
  }, [openTarget]);

  // Selecting Projects in the primary navigation always returns to the list,
  // even when a project detail is already open. Only a change to the token
  // resets, so a project opened from Home survives the initial render.
  const lastListResetTokenRef = useRef(listResetToken);
  useEffect(() => {
    if (lastListResetTokenRef.current === listResetToken) return;
    lastListResetTokenRef.current = listResetToken;
    setSelectedId(undefined);
    setTargetId(undefined);
    setOpenIntent(undefined);
    // Back now belongs to the list rather than to wherever this project was
    // opened from.
    setOpenedElsewhere(false);
  }, [listResetToken]);

  /** Opens a row's project; intent runs the shared edit form from the start. */
  function openProjectRow(projectId: string, intent?: ProjectOpenIntent) {
    setTargetId(undefined);
    setOpenIntent(intent);
    setSelectedId(projectId);
  }

  function backToList() {
    setSelectedId(undefined);
    setTargetId(undefined);
    setOpenIntent(undefined);
    // A project opened from another surface returns there rather than to the
    // project list, so the user keeps the place they came from.
    if (openedElsewhere) {
      setOpenedElsewhere(false);
      onOpenTargetClosed?.();
      return;
    }
    window.setTimeout(() => {
      document.querySelector<HTMLElement>(".projects-index__title")?.focus();
    }, 0);
  }

  if (selectedProject) {
    return (
      <ProjectDetail
        key={selectedProject.id}
        project={selectedProject}
        projects={projects}
        actions={actions}
        onBack={backToList}
        initialTargetId={targetId}
        backLabel={openedElsewhere ? "Home" : "Projects"}
        initialEdit={openIntent === "edit"}
        requestProjectDelete={requestProjectDelete}
      />
    );
  }

  return (
    <ProjectsIndex
      projects={projects}
      actions={actions.actions}
      actionsStorageError={actions.storageError}
      filter={filter}
      onFilterChange={setFilter}
      onOpen={openProjectRow}
      onDeleteProject={requestProjectDelete}
    />
  );
}
