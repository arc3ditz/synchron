import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { selectNextOpenAction } from "../actionStore";
import { formatRelativeProjectDate } from "../dates";
import {
  buildHomeAttention,
  buildHomeContext,
  selectContinueProject,
  type HomeAttentionItem,
  type HomeContextEntry,
} from "../homeOverview";
import type { ActionsController } from "../hooks/useActions";
import type { ProjectsController } from "../hooks/useProjects";
import type { Project } from "../projectStore";
import { ActionRow, todayKey } from "./ActionViews";
import { PlusIcon } from "./icons";

interface HomeCanvasProps {
  actions: ActionsController;
  projects: ProjectsController;
  /** Opens a project, optionally revealing one item inside it. */
  onOpenProject: (projectId: string, targetId?: string) => void;
  onOpenInbox: () => void;
  onOpenProjects: () => void;
}

/**
 * Quick capture. It writes straight to the inbox the app already has, so
 * there is one capture flow and one place to triage what was captured.
 */
function HomeCapture({
  onCapture,
  onOpenInbox,
}: {
  onCapture: (title: string) => void;
  onOpenInbox: () => void;
}) {
  const [title, setTitle] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;

    onCapture(trimmed);
    setTitle("");
  }

  return (
    <div className="home-capture">
      <form className="home-capture__form" onSubmit={submit}>
        <input
          className="home-capture__input"
          aria-label="Capture intention"
          placeholder="What is on your mind?"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <button
          className="home-capture__submit"
          type="submit"
          aria-label="Capture to the inbox"
          disabled={!title.trim()}
        >
          <PlusIcon aria-hidden="true" />
        </button>
      </form>
      <button type="button" className="home-capture__link" onClick={onOpenInbox}>
        Open inbox
      </button>
    </div>
  );
}

/**
 * The project to continue: its name, the outcome being pursued, the user's
 * own note about where they stopped, and the next open action that follows
 * from it. Everything shown already exists in the project.
 */
function HomeContinue({
  project,
  actions,
  onOpenProject,
}: {
  project: Project;
  actions: ActionsController;
  onOpenProject: (projectId: string) => void;
}) {
  const todayDate = todayKey();
  const linked = actions.actions.filter((action) => action.projectId === project.id);
  const next = selectNextOpenAction(linked, todayDate);

  return (
    <section className="home-section home-continue" aria-labelledby="home-continue-heading">
      <h2 id="home-continue-heading" className="home-section__eyebrow">
        Continue where you left off
      </h2>

      <button
        type="button"
        className="home-continue__name"
        onClick={() => onOpenProject(project.id)}
        aria-label={`Open project ${project.name}`}
      >
        {project.name}
      </button>

      {project.currentFocus ? (
        <p className="home-continue__focus">{project.currentFocus}</p>
      ) : (
        <p className="home-continue__focus home-continue__focus--empty">
          No focus recorded for this project yet.
        </p>
      )}

      {project.resume && (
        <blockquote className="home-continue__resume">
          <p className="home-continue__resume-text">{project.resume.note}</p>
          <p className="home-continue__resume-meta">
            Where you left off · {formatRelativeProjectDate(project.resume.updatedAt)}
          </p>
        </blockquote>
      )}

      <div className="home-continue__next">
        <p className="home-continue__next-label">Next action</p>
        {next ? (
          <ul className="action-list">
            {/* Keying by action keeps the row's edit state in step when
                completing one action reveals the next one. */}
            <ActionRow
              key={next.action.id}
              action={next.action}
              actions={actions}
              todayDate={todayDate}
              showReason
            />
          </ul>
        ) : (
          <p className="home-continue__next-empty">
            No open actions in this project yet. Open it to add the next one.
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Shown when projects exist but none holds anything to continue from. It names
 * the three signals that bring a project back here and points at the place to
 * record one, so the space above "Needs attention" still has a next step.
 */
function HomeContinueEmpty({ onOpenProjects }: { onOpenProjects: () => void }) {
  return (
    <section className="home-empty" aria-labelledby="home-continue-empty-heading">
      <h2 id="home-continue-empty-heading" className="home-empty__title">
        Nothing to pick up yet.
      </h2>
      <p className="home-empty__body">
        Open a project to record its current focus, add a resume note, or create an action.
        Home picks the project up from there.
      </p>
      <div className="home-empty__actions">
        <button
          type="button"
          className="action-button action-button--primary"
          onClick={onOpenProjects}
        >
          Open projects
        </button>
      </div>
    </section>
  );
}

/**
 * Projects with a recorded reason to come back to them. A card that names an
 * action opens the project at that action, using the same target the activity
 * view links with. The whole card stays one control: the action line is not a
 * second button inside it.
 */
function HomeAttention({
  items,
  onOpenProject,
}: {
  items: HomeAttentionItem[];
  onOpenProject: (projectId: string, targetId?: string) => void;
}) {
  return (
    <section className="home-section home-attention" aria-labelledby="home-attention-heading">
      <h2 id="home-attention-heading" className="home-section__eyebrow">
        Needs attention
      </h2>

      <ul className="home-attention__list">
        {items.map((item) => (
          <li key={item.project.id} className="home-attention__item">
            <button
              type="button"
              className="home-attention__open"
              onClick={() => onOpenProject(item.project.id, item.targetId)}
              aria-label={
                item.next
                  ? `Go to action: ${item.next.action.title} in ${item.project.name} (${item.reasonLabel})`
                  : `Open project ${item.project.name}`
              }
            >
              <span className="home-attention__name">{item.project.name}</span>
              <span className={`home-attention__reason home-attention__reason--${item.reason}`}>
                {item.reasonLabel}
              </span>
            </button>
            {item.next && (
              <p className="home-attention__next">{item.next.action.title}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The newest notes, decisions, and work across active projects. */
function HomeContext({
  entries,
  onOpenProject,
}: {
  entries: HomeContextEntry[];
  onOpenProject: (projectId: string, targetId?: string) => void;
}) {
  return (
    <section className="home-section home-context" aria-labelledby="home-context-heading">
      <h2 id="home-context-heading" className="home-section__eyebrow">
        Recent context
      </h2>

      <ul className="home-context__list">
        {entries.map((entry) => {
          const when = `${entry.label.toLowerCase()} ${formatRelativeProjectDate(entry.at)}`;
          return (
            <li key={entry.key} className="home-context__item">
              <button
                type="button"
                className="home-context__link"
                onClick={() => onOpenProject(entry.project.id, entry.targetId)}
                aria-label={`Go to ${entry.kind.toLowerCase()}: ${entry.title} in ${entry.project.name} (${when})`}
              >
                <span className="home-context__kind">{entry.kind}</span>
                <span className="home-context__body">
                  <span className="home-context__text">{entry.title}</span>
                  <span className="home-context__project">{entry.project.name}</span>
                </span>
                <span className="home-context__meta">{when}</span>
                <ArrowRight className="home-context__arrow" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The first thing a new user sees. It invites the first project rather than
 * showing empty panels, and points at the inbox if something was captured
 * already.
 */
function HomeEmpty({
  inboxCount,
  archivedCount,
  onOpenProjects,
  onOpenInbox,
}: {
  inboxCount: number;
  archivedCount: number;
  onOpenProjects: () => void;
  onOpenInbox: () => void;
}) {
  const title =
    archivedCount > 0 ? "Your projects are archived." : "Start with the project you keep coming back to.";
  const body =
    archivedCount > 0
      ? "Restore one to pick up its focus, notes, decisions, and open actions. Home will follow it again from there."
      : "A project holds the thread: the outcome you are pursuing, where you stopped, the notes and decisions along the way, and the actions waiting inside it. Home picks the story up from there.";

  return (
    <section className="home-empty" aria-labelledby="home-empty-heading">
      <h2 id="home-empty-heading" className="home-empty__title">
        {title}
      </h2>
      <p className="home-empty__body">{body}</p>
      {inboxCount > 0 && (
        <p className="home-empty__aside">
          {inboxCount === 1
            ? "One captured intention is waiting in your inbox."
            : `${inboxCount} captured intentions are waiting in your inbox.`}
        </p>
      )}
      <div className="home-empty__actions">
        <button
          type="button"
          className="action-button action-button--primary action-button--with-icon"
          onClick={onOpenProjects}
        >
          <PlusIcon aria-hidden="true" />
          <span>Open projects</span>
        </button>
        <button type="button" className="action-button" onClick={onOpenInbox}>
          Open the inbox
        </button>
      </div>
    </section>
  );
}

/**
 * Home is the workspace overview: the project to continue, the projects that
 * need a revisit, and the context that changed. It is derived entirely from
 * stored projects, actions, notes, and decisions.
 */
export function HomeCanvas({
  actions,
  projects,
  onOpenProject,
  onOpenInbox,
  onOpenProjects,
}: HomeCanvasProps) {
  const todayDate = todayKey();
  const activeProjects = useMemo(
    () => projects.projects.filter((project) => project.status === "active"),
    [projects.projects],
  );
  const archivedCount = projects.projects.length - activeProjects.length;
  const continueProject = useMemo(
    () => selectContinueProject(projects.projects, actions.actions),
    [projects.projects, actions.actions],
  );
  const attention = useMemo(
    () =>
      buildHomeAttention(projects.projects, actions.actions, todayDate, {
        excludeProjectId: continueProject?.id,
      }),
    [projects.projects, actions.actions, todayDate, continueProject?.id],
  );
  const context = useMemo(
    () => buildHomeContext(projects.projects, actions.actions, todayDate),
    [projects.projects, actions.actions, todayDate],
  );

  return (
    <>
      <div className="home-header">
        <h1 className="canvas__title home-title">Home</h1>
        <HomeCapture onCapture={actions.addInboxItem} onOpenInbox={onOpenInbox} />
      </div>

      {actions.storageError && (
        <p className="storage-warning" role="status">
          {actions.storageError}
        </p>
      )}

      {activeProjects.length === 0 ? (
        <HomeEmpty
          inboxCount={actions.inbox.length}
          archivedCount={archivedCount}
          onOpenProjects={onOpenProjects}
          onOpenInbox={onOpenInbox}
        />
      ) : (
        <>
          {continueProject ? (
            <HomeContinue
              project={continueProject}
              actions={actions}
              onOpenProject={onOpenProject}
            />
          ) : (
            <HomeContinueEmpty onOpenProjects={onOpenProjects} />
          )}
          {attention.length > 0 && (
            <HomeAttention items={attention} onOpenProject={onOpenProject} />
          )}
          {context.length > 0 && <HomeContext entries={context} onOpenProject={onOpenProject} />}
        </>
      )}
    </>
  );
}
