import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { Check, ChevronLeft, Pencil, Plus, Trash2 } from "lucide-react";

import { FORM_CONTROL } from "../theme";
import type { Goal, Milestone, Project, Task } from "../types";
import { calculateProjectProgress } from "../domain/projects";
import { formatFullDate } from "../utils/dates";

type ProjectsProps = {
  projects: Project[];
  goals: Goal[];
  milestones: Milestone[];
  tasks: Task[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  onNavigateToGoals?: () => void;
  onAddProject: (data: Omit<Project, "id" | "createdAt" | "status">) => void;
  onEditProject: (projectId: string, data: Omit<Project, "id" | "createdAt" | "status">) => void;
  onEditProjectStatus: (projectId: string, status: Project["status"]) => void;
  onDeleteProject: (projectId: string) => void;
  onAddMilestone: (data: Omit<Milestone, "id" | "completed">) => void;
  onEditMilestone: (milestoneId: string, data: Omit<Milestone, "id" | "completed">) => void;
  onDeleteMilestone: (milestoneId: string) => void;
  onToggleMilestone: (milestoneId: string) => void;
  onAddTask: (data: Omit<Task, "id" | "createdAt" | "completed">) => void;
  onEditTask: (taskId: string, data: Omit<Task, "id" | "createdAt" | "completed">) => void;
  onDeleteTask: (taskId: string) => void;
  onToggleTask: (taskId: string) => void;
};

type PendingDeletion = {
  type: "project" | "milestone" | "task";
  id: string;
  title: string;
};

const priorityStyles: Record<Task["priority"], CSSProperties> = {
  high: {
    color: "var(--priority-high-text)",
    background: "var(--priority-high-bg)",
    border: "1px solid var(--priority-high-border)",
  },
  medium: {
    color: "var(--priority-medium-text)",
    background: "var(--priority-medium-bg)",
    border: "1px solid var(--priority-medium-border)",
  },
  low: {
    color: "var(--priority-low-text)",
    background: "var(--priority-low-bg)",
    border: "1px solid var(--priority-low-border)",
  },
};

const styles: Record<string, CSSProperties> = {
  page: {
    width: "100%",
    maxWidth: "100%",
    marginInline: "auto",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "var(--space-4)",
    marginBottom: "var(--space-6)",
  },
  title: {
    margin: 0,
    color: "var(--text-primary)",
    fontSize: "var(--type-xl)",
    fontWeight: "var(--font-semibold)",
  },
  subtitle: {
    margin: "-12px 0 var(--space-5)",
    color: "var(--text-secondary)",
    fontSize: 13,
  },
  addButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--space-2)",
    flexShrink: 0,
    padding: "var(--space-2) var(--space-3)",
    border: "1px solid transparent",
    borderRadius: "var(--radius-md)",
    background: "var(--color-accent)",
    color: "var(--color-accent-contrast)",
    fontSize: "var(--type-sm)",
    fontWeight: "var(--font-semibold)",
    cursor: "pointer",
  },
  backButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    marginBottom: "var(--space-4)",
    padding: "6px 10px",
    border: "1px solid transparent",
    borderRadius: 7,
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: 13,
    cursor: "pointer",
  },
  breadcrumb: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: "var(--space-4)",
    color: "var(--text-secondary)",
    fontSize: 13,
  },
  breadcrumbLink: {
    color: "var(--color-accent)",
    background: "transparent",
    border: "none",
    padding: 0,
    fontSize: 13,
    cursor: "pointer",
  },
  breadcrumbSeparator: {
    color: "var(--text-muted)",
  },
  breadcrumbCurrent: {
    color: "var(--text-primary)",
    fontWeight: 500,
  },
  goalBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 8px",
    background: "var(--bg-inset)",
    borderRadius: 6,
    color: "var(--text-secondary)",
    fontSize: 12,
    fontWeight: 500,
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitleWithCount: {
    margin: 0,
    color: "var(--text-secondary)",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
  },
  sectionCount: {
    color: "var(--text-muted)",
    fontSize: 11,
    fontWeight: 500,
  },
  form: {
    display: "grid",
    gap: "var(--space-3)",
    marginBottom: "var(--space-4)",
    padding: "var(--space-4) 0",
    background: "transparent",
    border: "none",
    borderTop: "1px solid var(--border-color)",
    borderBottom: "1px solid var(--border-color)",
  },
  formTitle: {
    margin: 0,
    color: "var(--text-primary)",
    fontSize: 16,
    fontWeight: 600,
  },
  input: {
    ...FORM_CONTROL,
    width: "100%",
    minWidth: 0,
  },
  compactInput: {
    ...FORM_CONTROL,
    width: "100%",
    minWidth: 0,
  },
  formActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
  },
  secondaryButton: {
    padding: "8px 12px",
    border: "1px solid var(--border-color)",
    borderRadius: 8,
    background: "transparent",
    color: "var(--text-body)",
    fontSize: 13,
    cursor: "pointer",
  },
  submitButton: {
    padding: "8px 12px",
    border: "1px solid transparent",
    borderRadius: 8,
    background: "var(--color-accent)",
    color: "var(--color-accent-contrast)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  grid: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
    borderTop: "1px solid var(--border-color)",
  },
  card: {
    width: "100%",
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-4)",
    padding: "var(--space-5) 0",
    background: "transparent",
    border: "none",
    borderBottom: "1px solid var(--border-color)",
    borderRadius: 0,
  },
  cardHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  cardActions: {
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
    gap: 6,
  },
  iconButton: {
    display: "grid",
    placeItems: "center",
    width: 30,
    height: 30,
    padding: 0,
    border: "1px solid transparent",
    borderRadius: 7,
    background: "transparent",
    color: "var(--text-secondary)",
    cursor: "pointer",
  },
  projectTitleButton: {
    margin: 0,
    padding: 0,
    border: "none",
    background: "transparent",
    color: "var(--text-primary)",
    fontSize: 17,
    fontWeight: 600,
    textAlign: "left",
    overflowWrap: "anywhere",
    cursor: "pointer",
  },
  projectTitle: {
    margin: 0,
    color: "var(--text-primary)",
    fontSize: 20,
    fontWeight: 600,
    overflowWrap: "anywhere",
  },
  statusSelect: {
    ...FORM_CONTROL,
    width: "auto",
    minWidth: 108,
    cursor: "pointer",
  },
  status: {
    flexShrink: 0,
    padding: "3px 8px",
    border: "1px solid var(--border-strong)",
    borderRadius: 12,
    color: "var(--text-secondary)",
    fontSize: 10,
    textTransform: "capitalize",
  },
  description: {
    margin: "0",
    color: "var(--text-secondary)",
    fontSize: 13,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
  meta: {
    margin: "0",
    color: "var(--text-muted)",
    fontSize: 12,
  },
  progressTrack: {
    width: "100%",
    height: "var(--space-1)",
    marginTop: "var(--space-2)",
    borderRadius: "var(--radius-sm)",
    background: "var(--bg-inset)",
    overflow: "hidden",
    display: "flex",
  },
  progressFill: {
    height: "100%",
    background: "var(--color-accent)",
  },
  progressLegend: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 8,
    fontSize: 11,
    color: "var(--text-muted)",
  },
  progressLegendItem: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  progressLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  progressLegendDotTask: {
    background: "var(--color-accent)",
  },
  progressLegendDotMilestone: {
    background: "var(--color-accent-soft)",
  },
  percentLabel: {
    color: "var(--text-primary)",
    fontSize: 13,
    fontWeight: 600,
  },
  openButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    padding: "7px 0",
    border: "none",
    borderRadius: 0,
    background: "transparent",
    color: "var(--color-accent)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  empty: {
    gridColumn: "1 / -1",
    padding: 28,
    color: "var(--text-secondary)",
    textAlign: "center",
    background: "transparent",
    border: "none",
  },
  archivedSection: {
    display: "grid",
    gap: 12,
    marginTop: 24,
  },
  archivedToggle: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    width: "100%",
    padding: "10px 12px",
    border: "1px solid var(--border-color)",
    borderRadius: 8,
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: 13,
    fontWeight: 600,
    textAlign: "left",
    cursor: "pointer",
  },
  archivedList: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
    borderTop: "1px solid var(--border-color)",
  },
  detailCard: {
    width: "100%",
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-4)",
    padding: "var(--space-4) 0",
    background: "transparent",
    border: "none",
  },
  detailEditForm: {
    display: "grid",
    gap: 8,
    paddingTop: 12,
    borderTop: "1px solid var(--border-color)",
  },
  projectFormRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))",
    gap: 8,
  },
  projectLabel: {
    display: "grid",
    gap: 5,
    color: "var(--text-secondary)",
    fontSize: 12,
  },
  section: {
    width: "100%",
    display: "grid",
    gap: 8,
    paddingTop: 16,
    borderTop: "1px solid var(--border-color)",
  },
  sectionTitle: {
    margin: 0,
    color: "var(--text-secondary)",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
  },
  milestoneList: {
    display: "grid",
    gap: 0,
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  milestoneItem: {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-3)",
    padding: "var(--space-2) 0",
    borderBottom: "1px solid var(--border-color)",
  },
  milestoneContent: {
    flex: 1,
    minWidth: 0,
  },
  milestoneTitle: {
    margin: 0,
    color: "var(--text-primary)",
    fontSize: 13,
    fontWeight: 500,
    overflowWrap: "anywhere",
  },
  milestoneTitleCompleted: {
    textDecoration: "line-through",
    color: "var(--text-muted)",
  },
  milestoneMeta: {
    margin: "2px 0 0",
    color: "var(--text-muted)",
    fontSize: 11,
  },
  milestoneActions: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  checkbox: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 20,
    height: 20,
    minWidth: 20,
    minHeight: 20,
    flex: "0 0 20px",
    flexShrink: 0,
    padding: 0,
    borderWidth: 1,
    borderStyle: "solid",
    borderRadius: 6,
    cursor: "pointer",
    transition: "background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease",
  },
  taskList: {
    display: "grid",
    gap: 8,
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  taskRow: {
    display: "flex",
    alignItems: "center",
    gap: 9,
  },
  taskButton: {
    display: "flex",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    gap: 9,
    padding: "8px 12px",
    border: "1px solid transparent",
    borderRadius: 8,
    background: "transparent",
    color: "var(--text-body)",
    textAlign: "left",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  taskButtonHover: {
    background: "var(--button-hover-bg)",
    border: "1px solid var(--button-hover-border)",
  },
  taskDetails: {
    display: "grid",
    minWidth: 0,
    gap: 4,
  },
  taskMetadata: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    color: "var(--text-muted)",
    fontSize: 11,
  },
  priorityBadge: {
    padding: "1px 6px",
    fontSize: 10,
    fontWeight: 600,
    textTransform: "capitalize",
  },
  taskCheck: {
    display: "grid",
    placeItems: "center",
    width: 20,
    height: 20,
    flex: "0 0 20px",
    border: "1px solid var(--checkbox-border)",
    borderRadius: 6,
    background: "transparent",
    color: "var(--color-accent-contrast)",
    transition: "all 0.15s ease",
  },
  taskCheckCompleted: {
    background: "var(--checkbox-checked-bg)",
    border: "1px solid var(--checkbox-checked-border)",
    boxShadow: "var(--checkbox-checked-shadow)",
  },
  taskEditForm: {
    display: "grid",
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  taskFormFields: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr) minmax(82px, 0.7fr)",
    gap: 6,
  },
  addInlineButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    padding: "8px 0",
    border: "none",
    borderRadius: 0,
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: 12,
    cursor: "pointer",
  },
  emptyWithHint: {
    padding: "16px 0",
    color: "var(--text-secondary)",
    fontSize: 13,
    textAlign: "center",
  },
  emptyHint: {
    display: "block",
    marginTop: 4,
    color: "var(--text-muted)",
    fontSize: 12,
  },
  inlineForm: {
    display: "grid",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTop: "1px solid var(--border-color)",
  },
};

export default function Projects({
  projects,
  goals,
  milestones,
  tasks,
  selectedProjectId,
  onSelectProject,
  onNavigateToGoals,
  onAddProject,
  onEditProject,
  onEditProjectStatus,
  onDeleteProject,
  onAddMilestone,
  onEditMilestone,
  onDeleteMilestone,
  onToggleMilestone,
  onAddTask,
  onEditTask,
  onDeleteTask,
  onToggleTask,
}: ProjectsProps) {
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectGoalId, setProjectGoalId] = useState("");
  const [projectStartDate, setProjectStartDate] = useState("");
  const [projectTargetDate, setProjectTargetDate] = useState("");

  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectEditName, setProjectEditName] = useState("");
  const [projectEditDescription, setProjectEditDescription] = useState("");
  const [projectEditGoalId, setProjectEditGoalId] = useState("");
  const [projectEditStartDate, setProjectEditStartDate] = useState("");
  const [projectEditTargetDate, setProjectEditTargetDate] = useState("");

  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneTargetDate, setMilestoneTargetDate] = useState("");
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [milestoneEditTitle, setMilestoneEditTitle] = useState("");
  const [milestoneEditTargetDate, setMilestoneEditTargetDate] = useState("");

  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskEstimatedMinutes, setTaskEstimatedMinutes] = useState("");
  const [taskPriority, setTaskPriority] = useState<Task["priority"]>("medium");
  const [taskMilestoneId, setTaskMilestoneId] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskEditTitle, setTaskEditTitle] = useState("");
  const [taskEditDueDate, setTaskEditDueDate] = useState("");
  const [taskEditEstimatedMinutes, setTaskEditEstimatedMinutes] = useState("");
  const [taskEditPriority, setTaskEditPriority] = useState<Task["priority"]>("medium");
  const [taskEditMilestoneId, setTaskEditMilestoneId] = useState("");

  const [showArchivedProjects, setShowArchivedProjects] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<PendingDeletion | null>(null);

  // Reset transient detail-form state when moving between projects.
  useEffect(() => {
    setEditingProjectId(null);
    setShowMilestoneForm(false);
    setEditingMilestoneId(null);
    setShowTaskForm(false);
    setEditingTaskId(null);
    setItemToDelete(null);
  }, [selectedProjectId]);

  const activeGoals = goals.filter((goal) => goal.status !== "archived");
  const selectedProject = selectedProjectId
    ? projects.find((project) => project.id === selectedProjectId) ?? null
    : null;
  const activeProjects = projects.filter((project) => project.status !== "archived");
  const archivedProjects = projects.filter((project) => project.status === "archived");

  function goalOptions(selectedGoalId: string) {
    const current = goals.find((goal) => goal.id === selectedGoalId);
    const list = current && !activeGoals.includes(current) ? [...activeGoals, current] : activeGoals;
    return list.map((goal) => (
      <option key={goal.id} value={goal.id}>{goal.title}</option>
    ));
  }

  function confirmItemDeletion() {
    if (!itemToDelete) return;

    if (itemToDelete.type === "project") {
      onDeleteProject(itemToDelete.id);
      setEditingProjectId(null);
    }
    if (itemToDelete.type === "milestone") onDeleteMilestone(itemToDelete.id);
    if (itemToDelete.type === "task") onDeleteTask(itemToDelete.id);
    setItemToDelete(null);
  }

  function handleProjectSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = projectName.trim();
    if (!trimmedName) return;

    onAddProject({
      name: trimmedName,
      description: projectDescription.trim() || undefined,
      goalId: projectGoalId || undefined,
      startDate: projectStartDate || undefined,
      targetDate: projectTargetDate || undefined,
    });
    setProjectName("");
    setProjectDescription("");
    setProjectGoalId("");
    setProjectStartDate("");
    setProjectTargetDate("");
    setShowProjectForm(false);
  }

  function beginProjectEdit(project: Project) {
    setEditingProjectId(project.id);
    setProjectEditName(project.name);
    setProjectEditDescription(project.description ?? "");
    setProjectEditGoalId(project.goalId ?? "");
    setProjectEditStartDate(project.startDate ?? "");
    setProjectEditTargetDate(project.targetDate ?? "");
  }

  function handleProjectEditSubmit(event: FormEvent<HTMLFormElement>, projectId: string) {
    event.preventDefault();
    const trimmedName = projectEditName.trim();
    if (!trimmedName) return;

    onEditProject(projectId, {
      name: trimmedName,
      description: projectEditDescription.trim() || undefined,
      goalId: projectEditGoalId || undefined,
      startDate: projectEditStartDate || undefined,
      targetDate: projectEditTargetDate || undefined,
    });
    setEditingProjectId(null);
  }

  function handleMilestoneSubmit(event: FormEvent<HTMLFormElement>, project: Project) {
    event.preventDefault();
    const trimmedTitle = milestoneTitle.trim();
    if (!trimmedTitle) return;

    onAddMilestone({
      title: trimmedTitle,
      goalId: project.goalId,
      projectId: project.id,
      targetDate: milestoneTargetDate || undefined,
    });
    setMilestoneTitle("");
    setMilestoneTargetDate("");
    setShowMilestoneForm(false);
  }

  function handleMilestoneEditSubmit(event: FormEvent<HTMLFormElement>, milestone: Milestone) {
    event.preventDefault();
    const trimmedTitle = milestoneEditTitle.trim();
    if (!trimmedTitle) return;

    onEditMilestone(milestone.id, {
      title: trimmedTitle,
      goalId: milestone.goalId,
      projectId: milestone.projectId,
      targetDate: milestoneEditTargetDate || undefined,
    });
    setEditingMilestoneId(null);
  }

  function handleTaskSubmit(event: FormEvent<HTMLFormElement>, project: Project) {
    event.preventDefault();
    const trimmedTitle = taskTitle.trim();
    if (!trimmedTitle) return;

    const estimatedMinutes = Number(taskEstimatedMinutes);
    onAddTask({
      title: trimmedTitle,
      goalId: project.goalId,
      projectId: project.id,
      milestoneId: taskMilestoneId || undefined,
      dueDate: taskDueDate || undefined,
      estimatedMinutes: Number.isFinite(estimatedMinutes) && estimatedMinutes > 0
        ? estimatedMinutes
        : undefined,
      priority: taskPriority,
    });
    setTaskTitle("");
    setTaskDueDate("");
    setTaskEstimatedMinutes("");
    setTaskPriority("medium");
    setTaskMilestoneId("");
    setShowTaskForm(false);
  }

  function handleTaskEditSubmit(event: FormEvent<HTMLFormElement>, task: Task) {
    event.preventDefault();
    const trimmedTitle = taskEditTitle.trim();
    if (!trimmedTitle) return;

    const estimatedMinutes = Number(taskEditEstimatedMinutes);
    onEditTask(task.id, {
      title: trimmedTitle,
      goalId: task.goalId,
      projectId: task.projectId,
      milestoneId: taskEditMilestoneId || undefined,
      dueDate: taskEditDueDate || undefined,
      estimatedMinutes: Number.isFinite(estimatedMinutes) && estimatedMinutes > 0
        ? estimatedMinutes
        : undefined,
      priority: taskEditPriority,
    });
    setEditingTaskId(null);
  }

  function renderStatusSelect(project: Project) {
    return (
      <select
        style={{ ...styles.compactInput, ...styles.statusSelect }}
        value={project.status}
        onChange={(event) =>
          onEditProjectStatus(project.id, event.target.value as Project["status"])
        }
        aria-label={`Status for "${project.name}"`}
      >
        <option value="planned">Planned</option>
        <option value="active">Active</option>
        <option value="completed">Completed</option>
        <option value="archived">Archived</option>
      </select>
    );
  }

  function renderProjectCard(project: Project) {
    const linkedGoal = goals.find((goal) => goal.id === project.goalId);
    const progress = calculateProjectProgress(project, milestones, tasks);

    return (
      <article key={project.id} style={styles.card}>
        <div style={styles.cardHeader}>
          <button
            type="button"
            style={styles.projectTitleButton}
            onClick={() => onSelectProject(project.id)}
            aria-label={`Open project "${project.name}"`}
          >
            {project.name}
          </button>
          <div style={styles.cardActions}>
            {renderStatusSelect(project)}
            <button
              type="button"
              style={styles.iconButton}
              onClick={() => setItemToDelete({ type: "project", id: project.id, title: project.name })}
              aria-label={`Delete "${project.name}"`}
              title="Delete Project"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {project.description && <p style={styles.description}>{project.description}</p>}
        <p style={styles.meta}>
          {linkedGoal ? `Goal: ${linkedGoal.title}` : "No Goal"}
          {project.startDate && <> · Start: {formatFullDate(project.startDate)}</>}
          {project.targetDate && <> · Target: {formatFullDate(project.targetDate)}</>}
        </p>

        <div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <span style={styles.percentLabel}>{progress.percent}%</span>
            <span style={styles.meta}>
              Tasks {progress.taskCompleted}/{progress.taskTotal} · Milestones{" "}
              {progress.milestoneCompleted}/{progress.milestoneTotal}
            </span>
          </div>
          <div style={styles.progressTrack} role="progressbar" aria-label={`"${project.name}" progress`}>
            <div style={{ ...styles.progressFill, width: `${progress.percent}%` }} />
          </div>
        </div>

        <button
          type="button"
          style={styles.openButton}
          onClick={() => onSelectProject(project.id)}
        >
          Open Project
        </button>
      </article>
    );
  }

  function renderMilestonesSection(project: Project) {
    const projectMilestones = milestones.filter((milestone) => milestone.projectId === project.id);

    return (
      <section style={styles.section} aria-label={`Milestones for "${project.name}"`}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitleWithCount}>
            Milestones
            <span style={styles.sectionCount}> ({projectMilestones.length})</span>
          </h3>
        </div>
        {projectMilestones.length === 0 ? (
          <div style={styles.emptyWithHint}>
            No milestones yet
            <span style={styles.emptyHint}>Define key checkpoints for this project</span>
          </div>
        ) : (
          <ul style={styles.milestoneList}>
            {projectMilestones.map((milestone) => (
              <li key={milestone.id} style={styles.milestoneItem}>
                {editingMilestoneId === milestone.id ? (
                  <form
                    style={{ ...styles.taskEditForm, flex: 1 }}
                    onSubmit={(event) => handleMilestoneEditSubmit(event, milestone)}
                  >
                    <input
                      autoFocus
                      required
                      maxLength={120}
                      style={styles.compactInput}
                      value={milestoneEditTitle}
                      onChange={(event) => setMilestoneEditTitle(event.target.value)}
                      aria-label="Milestone Title"
                    />
                    <input
                      type="date"
                      style={styles.compactInput}
                      value={milestoneEditTargetDate}
                      onChange={(event) => setMilestoneEditTargetDate(event.target.value)}
                      aria-label="Milestone Target Date"
                    />
                    <div style={styles.formActions}>
                      <button
                        type="button"
                        style={styles.secondaryButton}
                        onClick={() => setEditingMilestoneId(null)}
                      >
                        Cancel
                      </button>
                      <button type="submit" style={styles.submitButton}>Save</button>
                    </div>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      className="milestone-checkbox"
                      style={styles.checkbox}
                      onClick={() => onToggleMilestone(milestone.id)}
                      aria-pressed={milestone.completed}
                      aria-label={`${milestone.completed ? "Mark incomplete" : "Complete"} milestone: "${milestone.title}"`}
                    >
                      {milestone.completed && (
                        <Check className="milestone-checkbox-icon" width={14} height={14} strokeWidth={2.5} />
                      )}
                    </button>
                    <div style={styles.milestoneContent}>
                      <h4
                        style={{
                          ...styles.milestoneTitle,
                          ...(milestone.completed ? styles.milestoneTitleCompleted : {}),
                        }}
                      >
                        {milestone.title}
                      </h4>
                      {milestone.targetDate && (
                        <p style={styles.milestoneMeta}>
                          Target: <time dateTime={milestone.targetDate}>{formatFullDate(milestone.targetDate)}</time>
                        </p>
                      )}
                    </div>
                    <div style={styles.milestoneActions}>
                      <button
                        type="button"
                        style={styles.iconButton}
                        onClick={() => {
                          setEditingMilestoneId(milestone.id);
                          setMilestoneEditTitle(milestone.title);
                          setMilestoneEditTargetDate(milestone.targetDate ?? "");
                        }}
                        aria-label={`Edit "${milestone.title}"`}
                        title="Edit Milestone"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        style={styles.iconButton}
                        onClick={() =>
                          setItemToDelete({ type: "milestone", id: milestone.id, title: milestone.title })
                        }
                        aria-label={`Delete "${milestone.title}"`}
                        title="Delete Milestone"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {showMilestoneForm ? (
          <form style={styles.inlineForm} onSubmit={(event) => handleMilestoneSubmit(event, project)}>
            <input
              autoFocus
              required
              maxLength={120}
              style={styles.compactInput}
              value={milestoneTitle}
              onChange={(event) => setMilestoneTitle(event.target.value)}
              placeholder="Milestone Title"
              aria-label="Milestone Title"
            />
            <input
              type="date"
              style={styles.compactInput}
              value={milestoneTargetDate}
              onChange={(event) => setMilestoneTargetDate(event.target.value)}
              aria-label="Milestone Target Date"
            />
            <div style={styles.formActions}>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => setShowMilestoneForm(false)}
              >
                Cancel
              </button>
              <button type="submit" style={styles.submitButton}>Add Milestone</button>
            </div>
          </form>
        ) : (
          <button type="button" style={styles.addInlineButton} onClick={() => setShowMilestoneForm(true)}>
            <Plus size={14} />
            Add Milestone
          </button>
        )}
      </section>
    );
  }

  function renderTaskItem(task: Task, projectMilestones: Milestone[]) {
    const linkedMilestone = projectMilestones.find((milestone) => milestone.id === task.milestoneId);

    return (
      <li key={task.id} style={styles.taskRow}>
        {editingTaskId === task.id ? (
          <form style={styles.taskEditForm} onSubmit={(event) => handleTaskEditSubmit(event, task)}>
            <input
              autoFocus
              required
              maxLength={120}
              style={styles.compactInput}
              value={taskEditTitle}
              onChange={(event) => setTaskEditTitle(event.target.value)}
              aria-label="Task Title"
            />
            {projectMilestones.length > 0 && (
              <select
                style={styles.compactInput}
                value={taskEditMilestoneId}
                onChange={(event) => setTaskEditMilestoneId(event.target.value)}
                aria-label="Link to Milestone (Optional)"
              >
                <option value="">No Milestone (General Task)</option>
                {projectMilestones.map((milestone) => (
                  <option key={milestone.id} value={milestone.id}>
                    {milestone.title}
                  </option>
                ))}
              </select>
            )}
            <div style={styles.taskFormFields}>
              <input
                type="date"
                style={styles.compactInput}
                value={taskEditDueDate}
                onChange={(event) => setTaskEditDueDate(event.target.value)}
                aria-label="Task Due Date"
              />
              <input
                type="number"
                min={1}
                step={1}
                style={styles.compactInput}
                value={taskEditEstimatedMinutes}
                onChange={(event) => setTaskEditEstimatedMinutes(event.target.value)}
                placeholder="Minutes"
                aria-label="Estimated Minutes"
              />
              <select
                style={styles.compactInput}
                value={taskEditPriority}
                onChange={(event) => setTaskEditPriority(event.target.value as Task["priority"])}
                aria-label="Task Priority"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div style={styles.formActions}>
              <button type="button" style={styles.secondaryButton} onClick={() => setEditingTaskId(null)}>
                Cancel
              </button>
              <button type="submit" style={styles.submitButton}>Save</button>
            </div>
          </form>
        ) : (
          <>
            <button
              type="button"
              style={styles.taskButton}
              onClick={() => onToggleTask(task.id)}
              aria-pressed={task.completed}
              aria-label={`${task.completed ? "Mark incomplete" : "Complete"} "${task.title}"`}
              onMouseEnter={(event) => {
                Object.assign(event.currentTarget.style, styles.taskButtonHover);
              }}
              onMouseLeave={(event) => {
                Object.assign(event.currentTarget.style, styles.taskButton);
              }}
            >
              <span
                style={{
                  ...styles.taskCheck,
                  ...(task.completed ? styles.taskCheckCompleted : {}),
                }}
              >
                {task.completed && <Check size={13} />}
              </span>
              <span style={styles.taskDetails}>
                <span style={{ overflowWrap: "anywhere", textDecoration: task.completed ? "line-through" : "none" }}>
                  {task.title}
                </span>
                <span style={styles.taskMetadata}>
                  <span style={{ ...styles.priorityBadge, ...priorityStyles[task.priority] }}>
                    {task.priority}
                  </span>
                  {task.dueDate && (
                    <time dateTime={task.dueDate}>Due {formatFullDate(task.dueDate)}</time>
                  )}
                  {task.estimatedMinutes && <span>{task.estimatedMinutes} min</span>}
                  {linkedMilestone && <span>{linkedMilestone.title}</span>}
                </span>
              </span>
            </button>
            <button
              type="button"
              style={styles.iconButton}
              onClick={() => {
                setEditingTaskId(task.id);
                setTaskEditTitle(task.title);
                setTaskEditDueDate(task.dueDate ?? "");
                setTaskEditEstimatedMinutes(task.estimatedMinutes?.toString() ?? "");
                setTaskEditPriority(task.priority);
                setTaskEditMilestoneId(task.milestoneId ?? "");
              }}
              aria-label={`Edit "${task.title}"`}
              title="Edit Task"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              style={styles.iconButton}
              onClick={() => setItemToDelete({ type: "task", id: task.id, title: task.title })}
              aria-label={`Delete "${task.title}"`}
              title="Delete Task"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </li>
    );
  }

  function renderTasksSection(project: Project) {
    const projectMilestones = milestones.filter((milestone) => milestone.projectId === project.id);
    const projectTasks = tasks.filter((task) =>
      task.projectId === project.id ||
      (task.milestoneId !== undefined && projectMilestones.some((milestone) => milestone.id === task.milestoneId)),
    );

    return (
      <section style={styles.section} aria-label={`Tasks for "${project.name}"`}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitleWithCount}>
            Tasks
            <span style={styles.sectionCount}> ({projectTasks.length})</span>
          </h3>
        </div>
        {projectTasks.length === 0 ? (
          <div style={styles.emptyWithHint}>
            No tasks yet
            <span style={styles.emptyHint}>Break down milestones into actionable tasks</span>
          </div>
        ) : (
          <ul style={styles.taskList}>
            {projectTasks.map((task) => renderTaskItem(task, projectMilestones))}
          </ul>
        )}

        {showTaskForm ? (
          <form style={styles.inlineForm} onSubmit={(event) => handleTaskSubmit(event, project)}>
            <input
              autoFocus
              required
              maxLength={120}
              style={styles.compactInput}
              value={taskTitle}
              onChange={(event) => setTaskTitle(event.target.value)}
              placeholder="Task Title"
              aria-label="Task Title"
            />
            {projectMilestones.length > 0 && (
              <select
                style={styles.compactInput}
                value={taskMilestoneId}
                onChange={(event) => setTaskMilestoneId(event.target.value)}
                aria-label="Link to Milestone (Optional)"
              >
                <option value="">No Milestone (General Task)</option>
                {projectMilestones.map((milestone) => (
                  <option key={milestone.id} value={milestone.id}>
                    {milestone.title}
                  </option>
                ))}
              </select>
            )}
            <div style={styles.taskFormFields}>
              <input
                type="date"
                style={styles.compactInput}
                value={taskDueDate}
                onChange={(event) => setTaskDueDate(event.target.value)}
                aria-label="Task Due Date"
              />
              <input
                type="number"
                min={1}
                step={1}
                style={styles.compactInput}
                value={taskEstimatedMinutes}
                onChange={(event) => setTaskEstimatedMinutes(event.target.value)}
                placeholder="Minutes"
                aria-label="Estimated Minutes"
              />
              <select
                style={styles.compactInput}
                value={taskPriority}
                onChange={(event) => setTaskPriority(event.target.value as Task["priority"])}
                aria-label="Task Priority"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div style={styles.formActions}>
              <button type="button" style={styles.secondaryButton} onClick={() => setShowTaskForm(false)}>
                Cancel
              </button>
              <button type="submit" style={styles.submitButton}>Add Task</button>
            </div>
          </form>
        ) : (
          <button type="button" style={styles.addInlineButton} onClick={() => setShowTaskForm(true)}>
            <Plus size={14} />
            Add Task
          </button>
        )}
      </section>
    );
  }

  function renderDetail(project: Project) {
    const linkedGoal = goals.find((goal) => goal.id === project.goalId);
    const progress = calculateProjectProgress(project, milestones, tasks);

    return (
      <section style={styles.page} aria-labelledby="project-detail-title">
        {linkedGoal && (
          <div style={styles.breadcrumb}>
            {onNavigateToGoals ? (
              <button
                type="button"
                style={styles.breadcrumbLink}
                onClick={onNavigateToGoals}
              >
                {linkedGoal.title}
              </button>
            ) : (
              <span style={styles.breadcrumbCurrent}>{linkedGoal.title}</span>
            )}
            <span style={styles.breadcrumbSeparator}>›</span>
            <span style={styles.breadcrumbCurrent}>{project.name}</span>
          </div>
        )}
        <button
          type="button"
          style={styles.backButton}
          onClick={() => onSelectProject(null)}
        >
          <ChevronLeft size={15} />
          All Projects
        </button>

        <div style={styles.detailCard}>
          <div style={styles.cardHeader}>
            <h1 id="project-detail-title" style={styles.projectTitle}>{project.name}</h1>
            <div style={styles.cardActions}>
              {renderStatusSelect(project)}
              <button
                type="button"
                style={styles.iconButton}
                onClick={() => beginProjectEdit(project)}
                aria-label={`Edit "${project.name}"`}
                title="Edit Project"
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                style={styles.iconButton}
                onClick={() => setItemToDelete({ type: "project", id: project.id, title: project.name })}
                aria-label={`Delete "${project.name}"`}
                title="Delete Project"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          {editingProjectId === project.id && (
            <form
              style={styles.detailEditForm}
              onSubmit={(event) => handleProjectEditSubmit(event, project.id)}
            >
              <input
                required
                maxLength={120}
                style={styles.compactInput}
                value={projectEditName}
                onChange={(event) => setProjectEditName(event.target.value)}
                aria-label="Project Name"
              />
              <textarea
                maxLength={500}
                style={{ ...styles.compactInput, minHeight: 56, resize: "vertical" }}
                value={projectEditDescription}
                onChange={(event) => setProjectEditDescription(event.target.value)}
                placeholder="Description (Optional)"
                aria-label="Project Description"
              />
              <div style={styles.projectFormRow}>
                <label style={styles.projectLabel}>
                  Goal (Optional)
                  <select
                    style={styles.compactInput}
                    value={projectEditGoalId}
                    onChange={(event) => setProjectEditGoalId(event.target.value)}
                    aria-label="Linked Goal (Optional)"
                  >
                    <option value="">No Goal</option>
                    {goalOptions(projectEditGoalId)}
                  </select>
                </label>
                <label style={styles.projectLabel}>
                  Start Date
                  <input
                    type="date"
                    style={styles.compactInput}
                    value={projectEditStartDate}
                    onChange={(event) => setProjectEditStartDate(event.target.value)}
                  />
                </label>
                <label style={styles.projectLabel}>
                  Target Date
                  <input
                    type="date"
                    style={styles.compactInput}
                    value={projectEditTargetDate}
                    onChange={(event) => setProjectEditTargetDate(event.target.value)}
                  />
                </label>
              </div>
              <div style={styles.formActions}>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => setEditingProjectId(null)}
                >
                  Cancel
                </button>
                <button type="submit" style={styles.submitButton}>Save Project</button>
              </div>
            </form>
          )}

          {project.description && <p style={styles.description}>{project.description}</p>}

          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
            {linkedGoal && (
              <div style={styles.goalBadge}>
                Goal: {linkedGoal.title}
              </div>
            )}
            <p style={styles.meta}>
              {project.startDate && <>Start: {formatFullDate(project.startDate)}</>}
              {project.startDate && project.targetDate && " · "}
              {project.targetDate && <>Target: {formatFullDate(project.targetDate)}</>}
              {(project.startDate || project.targetDate) && " · "}
              Status: {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
            </p>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <span style={styles.percentLabel}>{progress.percent}% complete</span>
              <span style={styles.meta}>{progress.completed} of {progress.total} items</span>
            </div>
            <div
              style={styles.progressTrack}
              role="progressbar"
              aria-label={`"${project.name}" progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent}
            >
              <div style={{ ...styles.progressFill, width: `${progress.percent}%` }} />
            </div>
            <div style={styles.progressLegend}>
              <div style={styles.progressLegendItem}>
                <div style={{ ...styles.progressLegendDot, ...styles.progressLegendDotTask }} />
                <span>Tasks {progress.taskCompleted}/{progress.taskTotal} ({progress.taskPercent}%)</span>
              </div>
              <div style={styles.progressLegendItem}>
                <div style={{ ...styles.progressLegendDot, ...styles.progressLegendDotMilestone }} />
                <span>
                  Milestones {progress.milestoneCompleted}/{progress.milestoneTotal} ({progress.milestonePercent}%)
                </span>
              </div>
            </div>
          </div>

          {renderMilestonesSection(project)}
          {renderTasksSection(project)}
        </div>
      </section>
    );
  }

  function renderList() {
    return (
      <section style={styles.page} aria-labelledby="projects-title">
        <header style={styles.header}>
          <h1 id="projects-title" style={styles.title}>Projects</h1>
          <button
            type="button"
            style={styles.addButton}
            onClick={() => setShowProjectForm((visible) => !visible)}
            aria-expanded={showProjectForm}
          >
            <Plus size={16} />
            New Project
          </button>
        </header>
        <p style={styles.subtitle}>
          A project is a body of work toward a goal (or on its own), with milestones and tasks inside it.
        </p>

        {showProjectForm && (
          <form style={styles.form} onSubmit={handleProjectSubmit}>
            <h2 style={styles.formTitle}>Create a Project</h2>
            <input
              autoFocus
              required
              maxLength={120}
              style={styles.input}
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="Project Name"
              aria-label="Project Name"
            />
            <textarea
              maxLength={500}
              style={{ ...styles.input, minHeight: 72, resize: "vertical" }}
              value={projectDescription}
              onChange={(event) => setProjectDescription(event.target.value)}
              placeholder="Description (Optional)"
              aria-label="Project Description"
            />
            <div style={styles.projectFormRow}>
              <label style={styles.projectLabel}>
                Goal (Optional)
                <select
                  style={styles.compactInput}
                  value={projectGoalId}
                  onChange={(event) => setProjectGoalId(event.target.value)}
                  aria-label="Linked Goal (Optional)"
                >
                  <option value="">No Goal</option>
                  {goalOptions(projectGoalId)}
                </select>
              </label>
              <label style={styles.projectLabel}>
                Start Date
                <input
                  type="date"
                  style={styles.compactInput}
                  value={projectStartDate}
                  onChange={(event) => setProjectStartDate(event.target.value)}
                />
              </label>
              <label style={styles.projectLabel}>
                Target Date
                <input
                  type="date"
                  style={styles.compactInput}
                  value={projectTargetDate}
                  onChange={(event) => setProjectTargetDate(event.target.value)}
                />
              </label>
            </div>
            <div style={styles.formActions}>
              <button type="button" style={styles.secondaryButton} onClick={() => setShowProjectForm(false)}>
                Cancel
              </button>
              <button type="submit" style={styles.submitButton}>Create Project</button>
            </div>
          </form>
        )}

        <div style={styles.grid}>
          {activeProjects.length === 0 ? (
            <div style={styles.empty}>
              No projects yet. Create one to group milestones and tasks toward an outcome.
            </div>
          ) : activeProjects.map((project) => renderProjectCard(project))}
        </div>

        {archivedProjects.length > 0 && (
          <section style={styles.archivedSection} aria-label="Archived Projects">
            <button
              type="button"
              style={styles.archivedToggle}
              onClick={() => setShowArchivedProjects((visible) => !visible)}
              aria-expanded={showArchivedProjects}
            >
              <span>
                {showArchivedProjects ? "Hide" : "Show"} Archived Projects ({archivedProjects.length})
              </span>
            </button>
            {showArchivedProjects && (
              <div style={styles.archivedList}>
                {archivedProjects.map((project) => renderProjectCard(project))}
              </div>
            )}
          </section>
        )}

      </section>
    );
  }

  function renderDeleteModal() {
    if (!itemToDelete) return null;

    return (
      <div className="modal-overlay" role="presentation" onClick={() => setItemToDelete(null)}>
        <div
          className="delete-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="projects-delete-modal-title"
          onClick={(event) => event.stopPropagation()}
        >
          <h2 id="projects-delete-modal-title">Delete "{itemToDelete.title}"?</h2>
          <p>
            {itemToDelete.type === "project"
              ? "Its milestones and tasks will be kept, but detached from this project. This action cannot be undone."
              : "This action cannot be undone."}
          </p>
          <div className="delete-modal-actions">
            <button
              type="button"
              className="delete-modal-cancel"
              onClick={() => setItemToDelete(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="delete-modal-confirm"
              onClick={confirmItemDeletion}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (selectedProject) {
    return (
      <>
        {renderDetail(selectedProject)}
        {renderDeleteModal()}
      </>
    );
  }

  return (
    <>
      {renderList()}
      {renderDeleteModal()}
    </>
  );
}
