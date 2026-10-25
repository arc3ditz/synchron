import { useLayoutEffect, useRef, useState } from "react";
import type {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flag,
  Folder,
  Star,
  X,
} from "lucide-react";
import {
  EFFORT_OPTIONS,
  getActionReasons,
  IMPORTANCE_LEVELS,
  type Action,
  type EffortMinutes,
  type Importance,
} from "../actionStore";
import type { ActionDraft, ActionsController } from "../hooks/useActions";
import type { Project } from "../projectStore";
import { CheckIcon, EditIcon, PlusIcon, TrashIcon } from "./icons";
import { AnchoredPopover, useConfirm } from "./Overlays";

type DateValue = string | undefined;

export function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function parseDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shiftDate(key: string, days: number): string {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function formatDateLabel(value: DateValue, today = todayKey()): string {
  if (!value) return "Schedule";
  if (value === today) return "Today";
  if (value === shiftDate(today, 1)) return "Tomorrow";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(parseDateKey(value));
}

export function formatToday(): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(new Date());
}

const fullDateFormat = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

function DatePopover({ value, onSelect }: { value?: string; onSelect: (value?: string) => void }) {
  const today = todayKey();
  const [monthKey, setMonthKey] = useState(value ?? today);
  const [activeDate, setActiveDate] = useState(value ?? today);
  const gridRef = useRef<HTMLDivElement>(null);
  const focusModeRef = useRef<"initial" | "move" | null>("initial");
  const monthDate = parseDateKey(`${monthKey.slice(0, 7)}-01`);
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(monthDate);
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).getDay();
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((firstDay + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - firstDay + 1;
    return day < 1 || day > daysInMonth ? undefined : dateKey(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
  });
  const activeInMonth = cells.includes(activeDate);
  const rovingDate = activeInMonth ? activeDate : cells.find((cell): cell is string => cell !== undefined);

  // Opening the calendar moves focus onto the selected day (or today). Moving
  // by keyboard follows the roving date into a newly displayed month.
  useLayoutEffect(() => {
    const mode = focusModeRef.current;
    if (!mode) return;
    const focusDay = () => {
      const day = gridRef.current?.querySelector<HTMLElement>(`[data-date="${rovingDate}"]`);
      if (!day) return;
      day.focus();
      // Clear only once focus landed. StrictMode runs mount effects twice, so
      // clearing up front would cancel the pending focus in development.
      focusModeRef.current = null;
    };
    // The popover is still hidden while its position is measured on the first
    // frame, and hidden elements cannot take focus. Opening waits one frame;
    // keyboard moves happen while the calendar is already visible.
    if (mode === "initial") {
      const frame = requestAnimationFrame(focusDay);
      return () => cancelAnimationFrame(frame);
    }
    focusDay();
  }, [rovingDate]);

  const moveActive = (target: string, focus: boolean) => {
    focusModeRef.current = focus ? "move" : null;
    setActiveDate(target);
    setMonthKey(target);
  };

  const changeMonth = (offset: number) => {
    const base = parseDateKey(activeInMonth ? activeDate : monthKey);
    const targetMonth = new Date(base.getFullYear(), base.getMonth() + offset, 1);
    const daysInTarget = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
    const day = Math.min(base.getDate(), daysInTarget);
    moveActive(dateKey(new Date(targetMonth.getFullYear(), targetMonth.getMonth(), day)), false);
  };

  const onGridKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const base = parseDateKey(activeDate);
    let target: string | undefined;
    if (event.key === "ArrowLeft") target = shiftDate(activeDate, -1);
    else if (event.key === "ArrowRight") target = shiftDate(activeDate, 1);
    else if (event.key === "ArrowUp") target = shiftDate(activeDate, -7);
    else if (event.key === "ArrowDown") target = shiftDate(activeDate, 7);
    else if (event.key === "Home") target = shiftDate(activeDate, -base.getDay());
    else if (event.key === "End") target = shiftDate(activeDate, 6 - base.getDay());
    else if (event.key === "PageUp" || event.key === "PageDown") {
      const targetMonth = new Date(base.getFullYear(), base.getMonth() + (event.key === "PageUp" ? -1 : 1), 1);
      const daysInTarget = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
      target = dateKey(new Date(targetMonth.getFullYear(), targetMonth.getMonth(), Math.min(base.getDate(), daysInTarget)));
    }
    if (!target) return;
    event.preventDefault();
    moveActive(target, true);
  };

  return <div className="date-popover">
    <div className="date-shortcuts"><button type="button" onClick={() => onSelect(today)}>Today</button><button type="button" onClick={() => onSelect(shiftDate(today, 1))}>Tomorrow</button><button type="button" onClick={() => onSelect(shiftDate(today, 7))}>Next week</button></div>
    <div className="calendar-heading"><button type="button" aria-label="Previous month" onClick={() => changeMonth(-1)}><ChevronLeft aria-hidden="true" /></button><strong aria-live="polite">{monthLabel}</strong><button type="button" aria-label="Next month" onClick={() => changeMonth(1)}><ChevronRight aria-hidden="true" /></button></div>
    <div className="calendar-weekdays" aria-hidden="true">{["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
    <div className="calendar-grid" ref={gridRef} role="group" aria-label="Choose a date" onKeyDown={onGridKeyDown}>{cells.map((cell, index) => cell ? <button key={cell} type="button" data-date={cell} tabIndex={cell === rovingDate ? 0 : -1} className={cell === value ? "calendar-day calendar-day--selected" : cell === today ? "calendar-day calendar-day--today" : "calendar-day"} aria-label={fullDateFormat.format(parseDateKey(cell))} aria-pressed={cell === value} aria-current={cell === today ? "date" : undefined} onClick={() => onSelect(cell)}>{parseDateKey(cell).getDate()}</button> : <span key={`blank-${index}`} />)}</div>
    {value && <button type="button" className="popover-clear" onClick={() => onSelect(undefined)}><X aria-hidden="true" />Remove due date</button>}
  </div>;
}

function ImportanceMenu({ value, onSelect }: { value: Importance; onSelect: (value: Importance) => void }) {
  return <div className="menu-list">{IMPORTANCE_LEVELS.map((level) => <button key={level} type="button" className={`menu-option menu-option--${level} ${value === level ? "menu-option--selected" : ""}`} onClick={() => onSelect(level)}><span className="menu-option__dot" />{level[0].toUpperCase() + level.slice(1)}{value === level && <Check aria-hidden="true" />}</button>)}</div>;
}

function EffortMenu({ value, onSelect }: { value?: EffortMinutes; onSelect: (value?: EffortMinutes) => void }) {
  return <div className="menu-list">{EFFORT_OPTIONS.map((minutes) => <button key={minutes} type="button" className={`menu-option ${value === minutes ? "menu-option--selected" : ""}`} onClick={() => onSelect(minutes)}>{minutes < 60 ? `${minutes} min` : `${minutes / 60} hour${minutes === 60 ? "" : "s"}`}{value === minutes && <Check aria-hidden="true" />}</button>)}<button type="button" className={`menu-option ${value === undefined ? "menu-option--selected" : ""}`} onClick={() => onSelect(undefined)}>No estimate{value === undefined && <Check aria-hidden="true" />}</button></div>;
}

/**
 * A quiet project association control. It only offers active projects, but an
 * existing reference to an archived or missing project stays visible so it can
 * be understood and removed rather than silently disappearing.
 */
export function ProjectPicker({
  projectId,
  projects,
  onChange,
}: {
  projectId?: string;
  projects: Project[];
  onChange: (projectId?: string) => void;
}) {
  const activeProjects = projects.filter((project) => project.status === "active");
  const currentProject = projectId ? projects.find((project) => project.id === projectId) : undefined;
  const unavailable = projectId !== undefined && currentProject === undefined;
  const currentIsArchived = currentProject?.status === "archived";

  // With no projects to offer and no existing association, the control would
  // only add noise to rows and forms.
  if (!projectId && activeProjects.length === 0) return null;

  const accessibleLabel = currentProject
    ? `Project: ${currentProject.name}${currentIsArchived ? " (archived)" : ""}`
    : unavailable
      ? "Linked project unavailable"
      : "Add to project";
  const triggerLabel = currentProject?.name ?? (unavailable ? "Project unavailable" : "Project");
  const stateClass = unavailable
    ? "meta-trigger--project-unavailable"
    : projectId
      ? "meta-trigger--project-linked"
      : "";

  return (
    <AnchoredPopover
      label={accessibleLabel}
      triggerLabel={triggerLabel}
      icon={<Folder aria-hidden="true" />}
      className={`meta-trigger--project ${stateClass}`}
    >
      {(close) => (
        <div className="menu-list">
          <button
            type="button"
            className={`menu-option ${projectId === undefined ? "menu-option--selected" : ""}`}
            onClick={() => {
              onChange(undefined);
              close();
            }}
          >
            <span className="menu-option__label">No project</span>
            {projectId === undefined && <Check aria-hidden="true" />}
          </button>
          {activeProjects.map((project) => (
            <button
              key={project.id}
              type="button"
              className={`menu-option ${projectId === project.id ? "menu-option--selected" : ""}`}
              onClick={() => {
                onChange(project.id);
                close();
              }}
            >
              <span className="menu-option__label">{project.name}</span>
              {projectId === project.id && <Check aria-hidden="true" />}
            </button>
          ))}
          {currentIsArchived && (
            <p className="menu-note">
              “{currentProject.name}” is archived. This action stays linked until you choose another
              project or no project.
            </p>
          )}
          {unavailable && (
            <p className="menu-note">
              The linked project is no longer available. You can remove this association or choose
              another project.
            </p>
          )}
        </div>
      )}
    </AnchoredPopover>
  );
}

function MetadataControls({
  dueDate,
  importance,
  effortMinutes,
  focused,
  todayDate,
  projects,
  projectId,
  onDueDate,
  onImportance,
  onEffort,
  onProject,
  onFocus,
  showFocus = true,
}: {
  dueDate?: string;
  importance: Importance;
  effortMinutes?: EffortMinutes;
  focused: boolean;
  todayDate: string;
  projects?: Project[];
  projectId?: string;
  onDueDate: (value?: string) => void;
  onImportance: (value: Importance) => void;
  onEffort: (value?: EffortMinutes) => void;
  onProject?: (value?: string) => void;
  onFocus: () => void;
  showFocus?: boolean;
}) {
  const dueClass = dueDate && dueDate < todayDate ? "meta-trigger--overdue" : dueDate === todayDate ? "meta-trigger--today" : "";
  return <div className="metadata-controls">
    <AnchoredPopover focusOnOpen={false} label={dueDate ? `Due ${formatDateLabel(dueDate, todayDate)}` : "Add due date"} className={dueClass} icon={<CalendarDays aria-hidden="true" />}>{(close) => <DatePopover value={dueDate} onSelect={(value) => { onDueDate(value); close(); }} />}</AnchoredPopover>
    <AnchoredPopover label={`${importance[0].toUpperCase() + importance.slice(1)} importance`} className={`meta-trigger--importance meta-trigger--${importance}`} icon={<Flag aria-hidden="true" />}>{(close) => <ImportanceMenu value={importance} onSelect={(value) => { onImportance(value); close(); }} />}</AnchoredPopover>
    <AnchoredPopover label={effortMinutes ? `${effortMinutes} minute estimate` : "Add effort estimate"} className="meta-trigger--effort" icon={<Clock3 aria-hidden="true" />}>{(close) => <EffortMenu value={effortMinutes} onSelect={(value) => { onEffort(value); close(); }} />}</AnchoredPopover>
    {projects && onProject && <ProjectPicker projectId={projectId} projects={projects} onChange={onProject} />}
    {showFocus && <button type="button" className={focused ? "meta-trigger meta-trigger--focus meta-trigger--focus-active" : "meta-trigger meta-trigger--focus"} aria-label={focused ? "Remove from today’s focus" : "Add to today’s focus"} aria-pressed={focused} onClick={onFocus}><Star aria-hidden="true" fill={focused ? "currentColor" : "none"} /></button>}
  </div>;
}

export function ActionForm({
  onSubmit,
  projects,
  projectId: fixedProjectId,
  inputId,
}: {
  onSubmit: (draft: ActionDraft) => void;
  projects?: Project[];
  /** When set, the form is embedded in a project and assigns it automatically. */
  projectId?: string;
  /** Lets a nearby empty state move focus to the title field. */
  inputId?: string;
}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState<string>();
  const [importance, setImportance] = useState<Importance>("normal");
  const [effortMinutes, setEffortMinutes] = useState<EffortMinutes>();
  const [projectId, setProjectId] = useState<string>();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    const selectedProjectId = fixedProjectId ?? projectId;
    onSubmit({
      title,
      dueDate,
      importance,
      effortMinutes,
      ...(selectedProjectId ? { projectId: selectedProjectId } : {}),
    });
    setTitle("");
    setDueDate(undefined);
    setImportance("normal");
    setEffortMinutes(undefined);
    setProjectId(undefined);
  }

  return <form className="action-form" onSubmit={submit}>
    <input id={inputId} aria-label="Action title" className="action-form__input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Add an action" />
    <div className="creation-metadata">
      <MetadataControls
        dueDate={dueDate}
        importance={importance}
        effortMinutes={effortMinutes}
        focused={false}
        todayDate={todayKey()}
        projects={fixedProjectId ? undefined : projects}
        projectId={fixedProjectId ?? projectId}
        onDueDate={setDueDate}
        onImportance={setImportance}
        onEffort={setEffortMinutes}
        onProject={fixedProjectId ? undefined : setProjectId}
        onFocus={() => undefined}
        showFocus={false}
      />
    </div>
    <button className="action-button action-button--primary action-button--with-icon" type="submit"><PlusIcon aria-hidden="true" /><span>Add action</span></button>
  </form>;
}

export function focusAfterRowRemoval(row: Element | null, siblingSelector: string | null, fallbackSelector: string) {
  let sibling: HTMLElement | null = null;
  if (siblingSelector) {
    for (const element of [row?.nextElementSibling, row?.previousElementSibling]) {
      sibling = element?.querySelector<HTMLElement>(siblingSelector) ?? null;
      if (sibling) break;
    }
  }
  const fallback = document.querySelector<HTMLElement>(fallbackSelector) ?? document.querySelector<HTMLElement>(".project-detail__back");
  // The row is removed in the same commit as the dialog or the status change;
  // wait for React to render, and only move focus if the row is really gone.
  window.setTimeout(() => {
    if (row?.isConnected) return;
    if (sibling?.isConnected) sibling.focus();
    else fallback?.focus();
  }, 0);
}

export function ActionRow({
  action,
  actions,
  projects,
  todayDate,
  showReason = false,
  anchorId,
}: {
  action: Action;
  actions: ActionsController;
  projects?: Project[];
  todayDate?: string;
  showReason?: boolean;
  /** Stable DOM id so project context can link to this action. */
  anchorId?: string;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(action.title);
  const rowRef = useRef<HTMLLIElement>(null);
  const confirm = useConfirm();
  const isFocusedToday = todayDate !== undefined && action.focusedDate === todayDate;
  const reasons = todayDate ? getActionReasons(action, todayDate) : [];
  const saveTitle = () => { if (title.trim()) actions.updateAction(action.id, { title }); setEditingTitle(false); };

  const updateProject = (projectId?: string) => {
    const row = rowRef.current;
    actions.updateAction(action.id, { projectId });
    // The row may leave a project-scoped list. In Today and Actions it stays
    // connected, so this wait exits without moving focus.
    focusAfterRowRemoval(row, ".action-row__title", ".action-form__input");
  };

  return <li ref={rowRef} id={anchorId} tabIndex={anchorId ? -1 : undefined} className={action.status === "completed" ? "action-row action-row--completed" : "action-row"}>
    <button type="button" className="action-row__check" role="checkbox" aria-checked={action.status === "completed"} aria-label={action.title} onClick={(event) => { const row = event.currentTarget.closest(".action-row"); if (action.status === "completed") actions.reopenAction(action.id); else actions.completeAction(action.id); focusAfterRowRemoval(row, ".action-row__title", ".action-form__input"); }}><span className="action-row__check-box" aria-hidden="true">{action.status === "completed" && <CheckIcon aria-hidden="true" />}</span></button>
    {editingTitle ? <input autoFocus aria-label={`Edit ${action.title}`} className="action-row__edit" value={title} onChange={(event) => setTitle(event.target.value)} onBlur={saveTitle} onKeyDown={(event) => { if (event.key === "Enter") saveTitle(); if (event.key === "Escape") { setTitle(action.title); setEditingTitle(false); } }} /> : <button type="button" className="action-row__title" onClick={() => setEditingTitle(true)}>{action.title}</button>}
    {showReason && reasons.length > 0 && <span className="action-row__reason">{reasons[0]}</span>}
    {action.status === "open" && todayDate && <MetadataControls dueDate={action.dueDate} importance={action.importance} effortMinutes={action.effortMinutes} focused={isFocusedToday} todayDate={todayDate} projects={projects} projectId={action.projectId} onDueDate={(value) => actions.updateAction(action.id, { dueDate: value })} onImportance={(value) => actions.updateAction(action.id, { importance: value })} onEffort={(value) => actions.updateAction(action.id, { effortMinutes: value })} onProject={projects ? updateProject : undefined} onFocus={() => isFocusedToday ? actions.removeActionFocus(action.id) : actions.focusActionToday(action.id, todayDate)} />}
    {action.status === "completed" && <span className="action-row__status">Completed</span>}
    <div className="action-row__operations"><button type="button" className="action-icon-button" title="Edit action" aria-label={`Edit ${action.title}`} onClick={() => setEditingTitle(true)}><EditIcon aria-hidden="true" /></button><button type="button" className="action-icon-button action-icon-button--quiet" title="Delete action" aria-label={`Delete ${action.title}`} onClick={(event) => { const row = event.currentTarget.closest(".action-row"); confirm({ title: "Delete action?", description: `“${action.title}” will be removed. This cannot be undone.`, confirmLabel: "Delete", trigger: event.currentTarget, onConfirm: () => { actions.deleteAction(action.id); focusAfterRowRemoval(row, ".action-row__title", ".action-form__input"); } }); }}><TrashIcon aria-hidden="true" /></button></div>
  </li>;
}

export function ActionList({
  items,
  actions,
  projects,
  empty,
  todayDate,
  showReason = false,
  anchorPrefix,
}: {
  items: Action[];
  actions: ActionsController;
  projects?: Project[];
  empty: string;
  todayDate?: string;
  showReason?: boolean;
  /** Prefix for stable DOM ids, so project context can link to an action row. */
  anchorPrefix?: string;
}) {
  if (items.length === 0) return <div className="empty empty--compact"><p className="empty__body">{empty}</p></div>;
  return <ul className="action-list">{items.map((action) => <ActionRow key={action.id} action={action} actions={actions} projects={projects} todayDate={todayDate} showReason={showReason} anchorId={anchorPrefix ? `${anchorPrefix}${action.id}` : undefined} />)}</ul>;
}
