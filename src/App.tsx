import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
  ListChecks,
  ListTodo,
  Timer as TimerIcon,
  Pencil,
  Trash2,
  History as HistoryIcon,
  ChevronLeft,
  ChevronRight,
  Check,
  BarChart3,
  Archive,
  ArchiveRestore,
  Snowflake,
  Settings,
  Target,
  Clock3,
  CalendarDays,
  Keyboard,
  Filter,
  Bell,
  Grid2X2,
  List,
  RotateCcw,
  Volume2,
  Info,
} from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
// Lines 18–22 in App.tsx
import FocusTimer from "./components/FocusTimer";
import Tasks from "./components/Tasks";
import CommandPalette from "./components/CommandPalette";
import type { PaletteCommand } from "./domain/commandPalette";
import History from "./components/History";
import Analytics from "./components/Analytics";
import Today from "./components/Today";
import Goals from "./components/Goals";
import Projects from "./components/Projects";
import StreakBadge from "./components/StreakBadge";
import KeyboardShortcutsModal from "./components/KeyboardShortcutsModal";
import Onboarding from "./components/Onboarding";
import { CARD_SURFACE } from "./theme";
import { configureSfx, playSfx } from "./utils/sfx";
import "./styles/AppLayout.css";
import type {
  Priority,
  FrequencyType,
  WeekStart,
  Theme,
  NotificationFrequency,
  View,
  AppSettings,
  Habit,
  Goal,
  Milestone,
  Task,
  FocusSessionRecord,
  Project,
  Summary,
} from "./types";
import {
  STORAGE_KEYS,
  loadStorageData,
  saveStorageData,
  loadGoals,
  saveGoals,
  loadTasks,
  saveTasks,
  loadMilestones,
  saveMilestones,
  saveHabits,
  loadProjects,
  saveProjects,
} from "./utils/storage";
import {
  createGoal,
  updateGoal,
  updateGoalStatus,
  createMilestone,
  updateMilestone,
  toggleMilestone,
  deleteMilestone,
  detachTasksFromDeletedMilestone,
  disassociateGoalFocusSessions,
} from "./domain/goals";
import {
  createProject,
  updateProject,
  updateProjectStatus,
  deleteProject,
  detachMilestonesFromDeletedProject,
  detachTasksFromDeletedProject,
  detachGoalFromProjects,
  disassociateProjectFocusSessions,
} from "./domain/projects";
import { createTask, completeTask, toggleTaskCompletion, updateTask, deleteTask } from "./domain/tasks";
import { buildFocusSessionRecord } from "./domain/focusTimer";
import {
  alignMilestone,
  alignProject,
  alignTask,
  detachHabitsFromDeletedGoal,
  normalizeRelationships,
  propagateProjectGoalChange,
} from "./domain/relationships";
import {
  getTodayKey,
  formatDateDisplay,
  shiftDateKey,
  getFrequencyType,
  isHabitScheduledOnDate,
  calculateStreak,
  WEEKDAYS,
} from "./utils/dates";
import {
  ensureNotificationActionTypesRegistered,
  getIntelligentNotification,
  sendIntelligentNotification,
  subscribeToNativeNotificationActions,
  type NotificationAction,
} from "./domain/notificationLogic";
import {
  markHabitComplete,
  markHabitIncomplete,
  sanitizeCompletedAt,
} from "./domain/completions";

const DEFAULT_SETTINGS: AppSettings = {
  viewMode: "grid",
  dayResetHour: 0,
  weekStart: "Sunday",
  defaultFocusDuration: 25,
  quickAdjustStepMinutes: 5,
  soundAlerts: true,
  sfxVolume: 80,
  sfxEnabled: {
    start: true,
    pauseResume: true,
    habitComplete: true,
    pomodoroTransition: true,
    timerComplete: true,
  },
  showMandatoryHabitsInImportantItems: false,
  enableIntelligentNotifications: true,
  notificationFrequency: "balanced",
  habitReminders: true,
  incompleteHabitReminders: true,
  theme: "dark",
  onboardingCompleted: false,
};
const FOCUS_DURATION_PRESETS = [15, 25, 45, 60];
const ALL_CATEGORIES = "All";
const NO_CATEGORY = "No Category";
const ADD_CATEGORY_VALUE = "__add_category__";
type HabitsPopover = "filter" | "category" | null;
type ShortcutContext = {
  view: View;
  editingId: number | null;
  navigateTo: (view: View) => void;
  openShortcuts: () => void;
  openPalette: () => void;
  shortcutsBlocked: boolean;
  setHabitViewMode: (viewMode: "grid" | "list") => void;
  focusNewHabit: () => void;
  editFocusedHabit: () => boolean;
  saveActiveEdit: () => void;
  toggleTimer: (() => boolean) | null;
  closeTransient: () => boolean;
};

const FREQUENCY_LABELS: Record<FrequencyType, string> = {
  daily: "Daily",
  weekdays: "Weekdays",
  weekends: "Weekends",
  custom: "Custom Days",
};

const typeBadgeBase: CSSProperties = {
  fontSize: "var(--type-xs)",
  fontWeight: "var(--font-medium)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-1) var(--space-2)",
  lineHeight: 1.35,
  textAlign: "center",
  whiteSpace: "normal",
  overflowWrap: "anywhere",
  maxWidth: "100%",
  width: "fit-content",
};

const styles: Record<string, CSSProperties> = {
  h1: {
    fontSize: 22,
    fontWeight: 600,
    color: "var(--text-primary)",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "var(--text-secondary)",
    marginBottom: 20,
  },
  summary: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    marginBottom: 32,
    paddingBottom: 20,
    borderBottom: "1px solid var(--border-color)",
  },
  summaryPrimary: {
    fontSize: 14,
    color: "var(--text-body)",
    fontWeight: 500,
  },
  summarySecondary: {
    fontSize: 12,
    color: "var(--text-secondary)",
  },
  dateNavigator: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 16,
  },

  dateButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    background: "var(--bg-surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: 20,
    padding: "7px 12px",
    color: "var(--text-secondary)",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  dateDisplay: {
    minWidth: 150,
    textAlign: "center",
    color: "var(--text-primary)",
    fontSize: 14,
    fontWeight: 600,
  },
  currentDateLabel: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    textAlign: "center",
    color: "var(--text-secondary)",
    fontSize: 13,
    marginTop: 12,
    marginBottom: 16,
  },
  inputRow: {
    display: "flex",
    gap: 8,
    marginBottom: 8,
    maxWidth: 640,
  },
  optionsRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
    marginBottom: 28,
  },
  input: {
    flex: 1,
    background: "var(--bg-surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    padding: "10px 14px",
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
  },
  select: {
    background: "var(--bg-surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    padding: "10px 14px",
    color: "var(--text-body)",
    fontSize: 14,
    outline: "none",
    cursor: "pointer",
  },
  habitPropertySelect: {
    background: "var(--bg-surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    padding: "10px 14px",
    color: "var(--text-body)",
    fontSize: 14,
    outline: "none",
    cursor: "pointer",
    flex: "1 1 140px",
    minWidth: 140,
    boxSizing: "border-box",
  },
  durationField: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  durationInput: {
    width: 60,
    background: "var(--bg-surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    padding: "10px 8px",
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
  },
  durationLabel: {
    fontSize: 13,
    color: "var(--text-secondary)",
  },
  frequencyDays: {
    display: "flex",
    gap: 4,
    alignItems: "center",
    flexWrap: "wrap",
  },
  frequencyDay: {
    width: 28,
    height: 28,
    padding: 0,
    borderRadius: 14,
    border: "1px solid var(--border-strong)",
    background: "transparent",
    color: "var(--text-muted)",
    fontSize: 11,
    cursor: "pointer",
  },
  frequencyDayActive: {
    background: "rgba(var(--accent-rgb), 0.1)",
    borderColor: "rgba(var(--accent-rgb), 0.42)",
    color: "var(--accent-teal)",
  },
  addButton: {
    background: "var(--bg-raised)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    padding: "10px 18px",
    color: "var(--text-body)",
    fontSize: 14,
    cursor: "pointer",
  },
  tableHeaderColors: {
    color: "var(--text-secondary)",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    borderBottom: "1px solid var(--border-color)",
    marginBottom: 8,
  },
  headerActionsCell: {
    textAlign: "center",
  },
  list: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-2)",
  },
  itemColors: {
    background: "transparent",
    border: "none",
    borderBottom: "1px solid var(--border-color)",
    borderRadius: 0,
    padding: "var(--space-3) 16px",
    boxShadow: "none",
  },
  itemCompletedColors: {
    background: "var(--accent-wash-soft)",
    borderBottom: "1px solid var(--accent-border-soft)",
    opacity: 1,
  },
  habitGridList: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
    gap: "var(--space-3)",
  },
  habitGridCard: {
    ...CARD_SURFACE,
    background: "var(--bg-surface)",
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-3)",
    minWidth: 0,
    padding: "var(--space-4)",
    transition: "border-color var(--transition-standard), transform var(--transition-standard)",
  },
  gridCardTop: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  gridCardName: {
    overflow: "hidden",
    color: "var(--text-primary)",
    fontSize: 15,
    fontWeight: 600,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  gridCardMiddle: {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-2)",
  },
  gridProgressTrack: {
    height: "var(--space-1)",
    marginTop: "var(--space-2)",
    overflow: "hidden",
    background: "var(--bg-inset)",
    borderRadius: "var(--radius-sm)",
  },
  gridProgressFill: {
    height: "100%",
    background: "var(--accent-teal)",
    borderRadius: "var(--radius-sm)",
    transition: "width 0.2s ease",
  },
  gridCardBottom: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    width: "100%",
    minHeight: 40,
  },
  habitName: {
    fontSize: "var(--type-sm)",
    color: "var(--text-body)",
    wordBreak: "break-word",
    overflowWrap: "break-word",
  },
  habitNameDone: {
    color: "var(--text-dim)",
    textDecoration: "line-through",
  },
  priorityBadge: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 22,
    fontSize: "var(--type-xs)",
    fontWeight: "var(--font-medium)",
    borderRadius: "var(--radius-md)",
    padding: "2px var(--space-2)",
    whiteSpace: "nowrap",
    letterSpacing: 0.2,
    width: "fit-content",
  },
  priorityMandatory: {
    color: "var(--color-accent)",
    background: "var(--accent-wash-soft)",
    border: "1px solid var(--accent-border-soft)",
  },
  priorityOptional: {
    color: "var(--text-secondary)",
    background: "var(--color-priority-neutral-wash)",
    border: "1px solid var(--border-color)",
  },
  dailyBadge: {
    ...typeBadgeBase,
    color: "var(--accent-teal)",
    background: "transparent",
    border: "1px solid var(--border-strong)",
  },
  offDayBadge: {
    ...typeBadgeBase,
    color: "var(--text-dim)",
    background: "transparent",
    border: "1px solid var(--border-strong)",
  },
  toggleButton: {
    background: "var(--bg-raised)",
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--radius-md)",
    padding: "0 var(--space-3)",
    minWidth: 128,
    height: 40,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    fontSize: "var(--type-xs)",
    fontWeight: "var(--font-medium)",
    color: "var(--text-secondary)",
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "background-color var(--transition-standard), color var(--transition-standard), border-color var(--transition-standard)",
  },
  toggleButtonDone: {
    background: "var(--accent-wash)",
    border: "1px solid var(--accent-border)",
    color: "var(--color-accent)",
  },
  habitCompletionButton: {
    background: "var(--bg-raised)",
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--radius-md)",
    padding: "0 10px",
    height: 28,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    fontSize: "var(--type-xs)",
    fontWeight: "var(--font-medium)",
    color: "var(--text-secondary)",
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
    transition: "background-color var(--transition-standard), color var(--transition-standard), border-color var(--transition-standard)",
  },
  iconButton: {
    background: "transparent",
    border: "1px solid transparent",
    borderRadius: 8,
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-muted)",
    cursor: "pointer",
    padding: 6,
    transition: "background 0.15s ease, color 0.15s ease",
    flexShrink: 0,
  },
  archiveButton: {
    background: "transparent",
    border: "1px solid transparent",
    borderRadius: 8,
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-muted)",
    cursor: "pointer",
    padding: 6,
    transition: "background 0.15s ease, color 0.15s ease",
    flexShrink: 0,
  },
  freezeButton: {
    background: "transparent",
    border: "1px solid transparent",
    borderRadius: 8,
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-muted)",
    cursor: "pointer",
    padding: 6,
    transition: "background 0.15s ease, color 0.15s ease",
    flexShrink: 0,
  },
  freezeButtonActive: {
    background: "var(--accent-wash-soft)",
    color: "var(--color-accent)",
  },
  streakFreezeToggle: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "transparent",
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--radius-md)",
    padding: "var(--space-2) var(--space-3)",
    fontSize: "var(--type-xs)",
    fontWeight: "var(--font-medium)",
    color: "var(--text-secondary)",
    cursor: "pointer",
    transition: "background-color var(--transition-standard), color var(--transition-standard), border-color var(--transition-standard)",
  },
  streakFreezeToggleActive: {
    background: "var(--accent-wash-soft)",
    color: "var(--color-accent)",
    borderColor: "var(--accent-border-soft)",
  },
  editRow: {
    gridColumn: "1 / -1",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    width: "100%",
    minWidth: 0,
  },
  gridEditRow: {
    background: "var(--bg-surface)",
    border: "1px solid var(--border-strong)",
    borderBottom: "1px solid var(--border-strong)",
    borderRadius: "var(--radius-md)",
    padding: "var(--space-4)",
    boxSizing: "border-box",
  },
  editFieldsRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
    width: "100%",
    minWidth: 0,
  },
  editInput: {
    flex: "2 1 220px",
    minWidth: 0,
    background: "var(--bg-inset)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    padding: "10px 14px",
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  },
  editSelect: {
    flex: "1 1 160px",
    minWidth: 0,
    maxWidth: "100%",
    background: "var(--bg-inset)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    padding: "10px 14px",
    color: "var(--text-body)",
    fontSize: 14,
    outline: "none",
    cursor: "pointer",
  },
  editDurationInput: {
    width: 56,
    background: "var(--bg-inset)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    padding: "10px 8px",
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
  },
  saveButton: {
    background: "rgba(var(--accent-rgb), 0.1)",
    border: "1px solid rgba(var(--accent-rgb), 0.42)",
    borderRadius: 20,
    padding: "8px 16px",
    fontSize: 12,
    fontWeight: 500,
    color: "var(--accent-teal)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  cancelButton: {
    background: "transparent",
    border: "1px solid var(--border-strong)",
    borderRadius: 20,
    padding: "8px 16px",
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-secondary)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  empty: {
    fontSize: 13,
    color: "var(--text-dim)",
    textAlign: "center",
    padding: "24px 0",
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    margin: "24px 0 8px",
  },
  timerCenter: {
    display: "flex",
    justifyContent: "center",
    paddingTop: 24,
  },
  categoryInput: {
    width: 170,
    background: "var(--bg-surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    padding: "10px 14px",
    color: "var(--text-body)",
    fontSize: 14,
    outline: "none",
  },
  categoryBadge: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 22,
    fontSize: "var(--type-xs)",
    fontWeight: "var(--font-medium)",
    color: "var(--color-category)",
    background: "var(--color-category-wash)",
    border: "1px solid var(--color-category-border)",
    borderRadius: "var(--radius-md)",
    padding: "2px var(--space-2)",
    whiteSpace: "nowrap",
  },
  categoryManageButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 34,
    height: 34,
    padding: 0,
    background: "var(--bg-surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: 9,
    color: "var(--text-secondary)",
    cursor: "pointer",
  },
  categoryManager: {
    position: "absolute",
    top: "calc(100% + 8px)",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 50,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    width: "100%",
    maxWidth: 420,
    padding: 14,
    background: "var(--bg-surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: 10,
    boxShadow: "0 12px 28px var(--shadow-medium)",
  },
  categoryManagerRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  categoryManagerName: {
    flex: 1,
    minWidth: 0,
    color: "var(--text-primary)",
    fontSize: 13,
  },
  settingsPage: {
    maxWidth: 840,
    width: "100%",
  },
  settingsSection: {
    marginBottom: "var(--space-8)",
  },
  settingsSectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-2)",
    margin: "0 0 var(--space-4)",
    color: "var(--text-primary)",
    fontSize: "var(--type-lg)",
    fontWeight: "var(--font-semibold)",
  },
  settingsCard: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-5)",
    padding: "var(--space-6)",
    border: "1px solid var(--border-color)",
    borderRadius: "var(--radius-lg)",
    background: "var(--bg-surface)",
  },
  settingsCardTitle: {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-2)",
    margin: "0 0 var(--space-3)",
    color: "var(--text-primary)",
    fontSize: "var(--type-base)",
    fontWeight: "var(--font-semibold)",
  },
  settingsRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "var(--space-4)",
    flexWrap: "wrap",
  },
  settingsRowCompact: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "var(--space-4)",
    flexWrap: "wrap",
  },
  settingsLabel: {
    color: "var(--text-body)",
    fontSize: "var(--type-sm)",
    fontWeight: "var(--font-medium)",
  },
  settingsSubheading: {
    margin: "var(--space-4) 0 var(--space-2)",
    color: "var(--text-primary)",
    fontSize: 13,
    fontWeight: 600,
  },
  settingsDescription: {
    display: "block",
    marginTop: 4,
    color: "var(--text-secondary)",
    fontSize: "var(--type-xs)",
    lineHeight: 1.5,
  },
  settingsSelect: {
    minWidth: 180,
  },
  settingsSegment: {
    display: "inline-flex",
    gap: "var(--space-1)",
    padding: "var(--space-1)",
    background: "var(--bg-inset)",
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--radius-md)",
  },
  settingsViewSegment: {
    alignItems: "center",
  },
  settingsAboutRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  settingsAppName: {
    color: "var(--text-primary)",
    fontSize: 15,
    fontWeight: 600,
  },
  settingsVersion: {
    display: "block",
    marginTop: 4,
    color: "var(--text-secondary)",
    fontSize: 12,
  },
  settingsActionButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    padding: "9px 12px",
    background: "var(--bg-surface)",
    color: "var(--text-body)",
    fontSize: 13,
    cursor: "pointer",
  },
  shortcutsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "var(--space-4)",
  },
  shortcutsGroup: {
    padding: "var(--space-4)",
    border: "1px solid var(--border-color)",
    borderRadius: "var(--radius-md)",
    background: "var(--bg-inset)",
  },
  shortcutsGroupTitle: {
    margin: "0 0 var(--space-3)",
    color: "var(--text-body)",
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  shortcutItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 0",
    borderBottom: "1px solid var(--border-color)",
  },
  shortcutItemLast: {
    borderBottom: "none",
  },
  shortcutDescription: {
    color: "var(--text-secondary)",
    fontSize: 13,
  },
  shortcutKeys: {
    display: "flex",
    gap: 4,
    alignItems: "center",
  },
  shortcutKey: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 24,
    height: 24,
    padding: "0 6px",
    background: "var(--bg-surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: 4,
    color: "var(--text-primary)",
    fontSize: 11,
    fontWeight: 500,
    fontFamily: "ui-monospace, monospace",
  },
};

function formatFrequencyLabel(
  habit: Pick<Habit, "frequencyType" | "customDays">,
): string {
  const frequencyType = getFrequencyType(habit);
  const days = WEEKDAYS.filter((day) => habit.customDays?.includes(day));
  if (frequencyType === "custom" && days.length > 0) {
    return `${FREQUENCY_LABELS.custom}: ${days.join(", ")}`;
  }
  return FREQUENCY_LABELS[frequencyType];
}

// "school  work" -> "School Work" so filter tabs never split on casing.
function normalizeCategory(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function loadCustomCategories(): string[] {
  const parsed = loadStorageData<string[]>(STORAGE_KEYS.CUSTOM_CATEGORIES, []);
  if (!Array.isArray(parsed)) return [];
  return Array.from(
    new Set(
      parsed
        .filter((category): category is string => typeof category === "string")
        .map(normalizeCategory)
        .filter(Boolean),
    ),
  ).sort();
}

function loadAppSettings(): AppSettings {
  const parsed = loadStorageData<Partial<AppSettings>>(STORAGE_KEYS.SETTINGS, {});
  return {
    dayResetHour: [0, 2, 3].includes(parsed.dayResetHour ?? -1)
      ? parsed.dayResetHour!
      : DEFAULT_SETTINGS.dayResetHour,
    weekStart: parsed.weekStart === "Monday" ? "Monday" : "Sunday",
    defaultFocusDuration: FOCUS_DURATION_PRESETS.includes(parsed.defaultFocusDuration ?? -1)
      ? parsed.defaultFocusDuration!
      : DEFAULT_SETTINGS.defaultFocusDuration,
    quickAdjustStepMinutes: Number.isInteger(parsed.quickAdjustStepMinutes)
      && parsed.quickAdjustStepMinutes! >= 1
      && parsed.quickAdjustStepMinutes! <= 180
      ? parsed.quickAdjustStepMinutes!
      : DEFAULT_SETTINGS.quickAdjustStepMinutes,
    soundAlerts: typeof parsed.soundAlerts === "boolean"
      ? parsed.soundAlerts
      : DEFAULT_SETTINGS.soundAlerts,
    sfxVolume: typeof parsed.sfxVolume === "number"
      && parsed.sfxVolume >= 0
      && parsed.sfxVolume <= 100
      ? parsed.sfxVolume
      : DEFAULT_SETTINGS.sfxVolume,
    sfxEnabled: typeof parsed.sfxEnabled === "object" && parsed.sfxEnabled !== null
      ? {
          start: typeof parsed.sfxEnabled.start === "boolean" ? parsed.sfxEnabled.start : DEFAULT_SETTINGS.sfxEnabled.start,
          pauseResume: typeof parsed.sfxEnabled.pauseResume === "boolean" ? parsed.sfxEnabled.pauseResume : DEFAULT_SETTINGS.sfxEnabled.pauseResume,
          habitComplete: typeof parsed.sfxEnabled.habitComplete === "boolean" ? parsed.sfxEnabled.habitComplete : DEFAULT_SETTINGS.sfxEnabled.habitComplete,
          pomodoroTransition: typeof parsed.sfxEnabled.pomodoroTransition === "boolean" ? parsed.sfxEnabled.pomodoroTransition : DEFAULT_SETTINGS.sfxEnabled.pomodoroTransition,
          timerComplete: typeof parsed.sfxEnabled.timerComplete === "boolean" ? parsed.sfxEnabled.timerComplete : DEFAULT_SETTINGS.sfxEnabled.timerComplete,
        }
      : DEFAULT_SETTINGS.sfxEnabled,
    showMandatoryHabitsInImportantItems: typeof parsed.showMandatoryHabitsInImportantItems === "boolean"
      ? parsed.showMandatoryHabitsInImportantItems
      : DEFAULT_SETTINGS.showMandatoryHabitsInImportantItems,
    enableIntelligentNotifications: typeof parsed.enableIntelligentNotifications === "boolean"
      ? parsed.enableIntelligentNotifications
      : DEFAULT_SETTINGS.enableIntelligentNotifications,
    notificationFrequency: ["conservative", "balanced", "frequent"].includes(parsed.notificationFrequency ?? "")
      ? parsed.notificationFrequency as NotificationFrequency
      : DEFAULT_SETTINGS.notificationFrequency,
    habitReminders: typeof parsed.habitReminders === "boolean"
      ? parsed.habitReminders
      : DEFAULT_SETTINGS.habitReminders,
    incompleteHabitReminders: typeof parsed.incompleteHabitReminders === "boolean"
      ? parsed.incompleteHabitReminders
      : DEFAULT_SETTINGS.incompleteHabitReminders,
    theme: parsed.theme === "light" ? "light" : "dark",
    viewMode: parsed.viewMode === "list" ? "list" : "grid",
    onboardingCompleted: typeof parsed.onboardingCompleted === "boolean"
      ? parsed.onboardingCompleted
      : DEFAULT_SETTINGS.onboardingCompleted,
  };
}

function computeSummary(habits: Habit[], dateKey: string): Summary {
  const total = habits.length;
  const doneCount = habits.filter((habit) => habit.completedDates.includes(dateKey)).length;
  const mandatory = habits.filter((habit) => habit.priority === "Mandatory");
  const mandatoryDone = mandatory.filter((habit) => habit.completedDates.includes(dateKey)).length;
  return {
    total,
    doneCount,
    percent: total === 0 ? 0 : Math.round((doneCount / total) * 100),
    mandatoryTotal: mandatory.length,
    mandatoryDone,
  };
}

function createHabitId(): number {
  return Date.now();
}

function SettingsSwitch({
  label,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      className="ui-toggle"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
    />
  );
}

function App() {
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const shortcutKey = isMac ? "⌘" : "Ctrl";

  const [appSettings, setAppSettings] = useState<AppSettings>(loadAppSettings);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [view, setView] = useState<View>("Today");
  const [selectedDateKey, setSelectedDateKey] = useState(() =>
    getTodayKey(appSettings.dayResetHour),
  );
  const lastLogicalDateKeyRef = useRef(getTodayKey(appSettings.dayResetHour));

  const [habits, setHabits] = useState<Habit[]>(() => {
    const localLoadHabits = (): Habit[] => {
      const parsed = loadStorageData<Array<Partial<Habit> & { id: number; name: string }>>(STORAGE_KEYS.HABITS, []);
      if (!Array.isArray(parsed)) return [];

      return parsed.map((item) => {
        const category =
          typeof item.category === "string" ? normalizeCategory(item.category) : "";
        const completedDates = Array.isArray(item.completedDates)
          ? item.completedDates
          : [];
        // Historical records predate timestamp collection: keep them as-is
        // and only retain valid timestamps for dates actually completed.
        const completedAt = sanitizeCompletedAt(completedDates, item.completedAt);

        return {
          id: item.id,
          name: item.name,
          createdAt: typeof item.createdAt === "string" ? item.createdAt : undefined,
          goalId: typeof item.goalId === "string" ? item.goalId : undefined,
          priority: item.priority === "Mandatory" ? "Mandatory" : "Optional",
          type: "Daily",
          frequencyType:
            item.frequencyType === "weekdays" ||
            item.frequencyType === "weekends" ||
            item.frequencyType === "custom"
              ? item.frequencyType
              : "daily",
          customDays: Array.isArray(item.customDays)
            ? item.customDays.filter((day): day is string => WEEKDAYS.includes(day))
            : [],
          completedDates,
          ...(completedAt !== undefined ? { completedAt } : {}),
          streakFreezeDates: Array.isArray(item.streakFreezeDates)
            ? item.streakFreezeDates
            : [],
          isArchived: item.isArchived === true,
          category: category || undefined,
          scheduledTime: typeof item.scheduledTime === "string" ? item.scheduledTime : undefined,
          durationMinutes: typeof item.durationMinutes === "number" && item.durationMinutes > 0 ? item.durationMinutes : undefined,
        };
      });
    };
    return localLoadHabits();
  });
  // Normalize Goal → Project → Milestone → Task relationships at the
  // storage loading boundary so invalid references are detached safely.
  const [initialRelationships] = useState(() =>
    normalizeRelationships(loadGoals(), loadProjects(), loadMilestones(), loadTasks()),
  );
  const [goals, setGoals] = useState<Goal[]>(loadGoals);
  const [projects, setProjects] = useState<Project[]>(() => initialRelationships.projects);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>(() => initialRelationships.tasks);
  const [milestones, setMilestones] = useState<Milestone[]>(() => initialRelationships.milestones);
  const [focusSessions, setFocusSessions] = useState<FocusSessionRecord[]>(() => {
    const parsed = loadStorageData<FocusSessionRecord[]>(STORAGE_KEYS.FOCUS_SESSIONS, []);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item: FocusSessionRecord) => {
      return (
        typeof item.id === "number" &&
        typeof item.timestamp === "number" &&
        (item.sessionType === "Timer" || item.sessionType === "Pomodoro Focus") &&
        typeof item.durationMinutes === "number" &&
        typeof item.habitName === "string"
      );
    });
  });
  const [newHabit, setNewHabit] = useState("");
  const [newGoalId, setNewGoalId] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("Optional");
  const [newFrequencyType, setNewFrequencyType] = useState<FrequencyType>("daily");
  const [newCustomDays, setNewCustomDays] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingGoalId, setEditingGoalId] = useState("");
  const [editingPriority, setEditingPriority] = useState<Priority>("Optional");
  const [editingFrequencyType, setEditingFrequencyType] = useState<FrequencyType>("daily");
  const [editingCustomDays, setEditingCustomDays] = useState<string[]>([]);
  const [editingCategory, setEditingCategory] = useState("");
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORIES);
  const [customCategories, setCustomCategories] = useState<string[]>(loadCustomCategories);
  const [habitsPopover, setHabitsPopover] = useState<HabitsPopover>(null);
  const filterPopoverRef = useRef<HTMLDivElement>(null);
  const categoryPopoverTriggerRef = useRef<HTMLButtonElement>(null);
  const categoryPopoverRef = useRef<HTMLDivElement>(null);
  const newHabitInputRef = useRef<HTMLInputElement>(null);
  const shortcutContextRef = useRef<ShortcutContext | null>(null);
  const timerShortcutRef = useRef<(() => boolean) | null>(null);
  const focusTimerAfterNavigationRef = useRef(false);
  const notificationIntervalRegisteredRef = useRef(false);
  const notificationListenerRegisteredRef = useRef(false);
  const registerTimerShortcut = useCallback((handler: (() => boolean) | null) => {
    timerShortcutRef.current = handler;
  }, []);
  const [editingCustomCategory, setEditingCustomCategory] = useState<string | null>(null);
  const [customCategoryDraft, setCustomCategoryDraft] = useState("");
  const [categoryPendingDeletion, setCategoryPendingDeletion] = useState<string | null>(null);
  const [habitPendingDeletion, setHabitPendingDeletion] = useState<Habit | null>(null);
  const [focusSessionPendingDeletion, setFocusSessionPendingDeletion] = useState<FocusSessionRecord | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Filter state
  const [filterPriority, setFilterPriority] = useState<"All" | "Mandatory" | "Optional">("All");
  const [filterFrequency, setFilterFrequency] = useState<"All" | "daily" | "weekdays" | "weekends">("All");
  const [filterStatus, setFilterStatus] = useState<"All" | "Active" | "Archived" | "Completed Today" | "Incomplete Today">("All");

  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const quickTaskFocusRef = useRef<(() => void) | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(!appSettings.onboardingCompleted);
  const [streakFreeze, setStreakFreeze] = useState(() => {
    const stored = loadStorageData<string>(STORAGE_KEYS.STREAK_FREEZE, "false");
    return stored === "true";
  });
  const [initialFocusEntityId, setInitialFocusEntityId] = useState<{
    taskId?: string;
    habitId?: number;
    goalId?: string;
    title?: string;
  } | undefined>(undefined);
  const [notificationTimerAction, setNotificationTimerAction] = useState<{
    habitId?: number;
    title?: string;
    durationMinutes?: number;
  } | null>(null);

  useEffect(() => {
    saveStorageData(STORAGE_KEYS.SETTINGS, appSettings);
  }, [appSettings]);

  useEffect(() => {
    configureSfx({
      enabled: appSettings.soundAlerts,
      volume: appSettings.sfxVolume,
      sfxEnabled: appSettings.sfxEnabled,
    });
  }, [appSettings.soundAlerts, appSettings.sfxVolume, appSettings.sfxEnabled]);

  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", appSettings.theme);
  }, [appSettings.theme]);

  useEffect(() => {
    saveHabits(habits);
  }, [habits]);

  useEffect(() => {
    let cancelled = false;
    getVersion()
      .then((version) => {
        if (!cancelled) setAppVersion(version);
      })
      .catch(() => {
        if (!cancelled) setAppVersion(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function syncHabitDay() {
      const currentDateKey = getTodayKey(appSettings.dayResetHour);
      const previousDateKey = lastLogicalDateKeyRef.current;
      if (currentDateKey === previousDateKey) return;

      lastLogicalDateKeyRef.current = currentDateKey;
      setSelectedDateKey((selected) =>
        selected === previousDateKey ? currentDateKey : selected,
      );
    }

    const intervalId = window.setInterval(syncHabitDay, 30_000);
    window.addEventListener("focus", syncHabitDay);
    document.addEventListener("visibilitychange", syncHabitDay);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", syncHabitDay);
      document.removeEventListener("visibilitychange", syncHabitDay);
    };
  }, [appSettings.dayResetHour]);

  useEffect(() => {
    saveGoals(goals);
  }, [goals]);

  useEffect(() => {
    saveProjects(projects);
  }, [projects]);

  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    saveMilestones(milestones);
  }, [milestones]);

  useEffect(() => {
    saveStorageData(STORAGE_KEYS.FOCUS_SESSIONS, focusSessions);
  }, [focusSessions]);

  useEffect(() => {
    saveStorageData(STORAGE_KEYS.STREAK_FREEZE, String(streakFreeze));
  }, [streakFreeze]);

  useEffect(() => {
    saveStorageData(STORAGE_KEYS.CUSTOM_CATEGORIES, customCategories);
  }, [customCategories]);

  // Shared Milestone/Task handlers — used by both the Goals and Projects views
  // so there is exactly one wiring of the domain logic.
  function handleAddProject(data: Omit<Project, "id" | "createdAt" | "status">) {
    setProjects((current) => [...current, alignProject(createProject(data), goals)]);
  }

  function handleAddTask(data: Omit<Task, "id" | "createdAt" | "completed">) {
    setTasks((current) => [...current, alignTask(createTask(data), milestones, projects)]);
  }

  function handleToggleTask(taskId: string) {
    setTasks((current) => current.map((task) =>
      task.id === taskId ? toggleTaskCompletion(task) : task,
    ));
  }

  function handleEditTask(taskId: string, data: Omit<Task, "id" | "createdAt" | "completed">) {
    setTasks((current) => current.map((task) =>
      task.id === taskId ? alignTask(updateTask(task, data), milestones, projects) : task,
    ));
  }

  function handleDeleteTask(taskId: string) {
    setTasks((current) => deleteTask(current, taskId));
  }

  function handleAddMilestone(data: Omit<Milestone, "id" | "completed">) {
    setMilestones((current) => [...current, alignMilestone(createMilestone(data), projects)]);
  }

  function handleEditMilestone(milestoneId: string, data: Omit<Milestone, "id" | "completed">) {
    setMilestones((current) => current.map((milestone) =>
      milestone.id === milestoneId ? alignMilestone(updateMilestone(milestone, data), projects) : milestone,
    ));
  }

  function handleDeleteMilestone(milestoneId: string) {
    const milestone = milestones.find((item) => item.id === milestoneId);
    if (milestone) {
      setTasks((current) => detachTasksFromDeletedMilestone(current, milestone));
    }
    setMilestones((current) => deleteMilestone(current, milestoneId));
  }

  function handleToggleMilestone(milestoneId: string) {
    setMilestones((current) => current.map((milestone) =>
      milestone.id === milestoneId ? toggleMilestone(milestone) : milestone,
    ));
  }

  function handleOnboardingComplete(createdHabit?: Habit) {
    if (createdHabit) {
      setHabits((current) => [...current, createdHabit]);
    }
  }

  function handleOnboardingNavigateToToday() {
    setAppSettings((current) => ({ ...current, onboardingCompleted: true }));
    setShowOnboarding(false);
    setView("Today");
  }

  function handleOnboardingSkip() {
    setAppSettings((current) => ({ ...current, onboardingCompleted: true }));
    setShowOnboarding(false);
  }

  useEffect(() => {
    // Prevent multiple interval registrations
    if (notificationIntervalRegisteredRef.current) return;
    notificationIntervalRegisteredRef.current = true;

    // Check for intelligent notifications every 5 minutes
    const checkNotifications = () => {
      const currentHour = new Date().getHours();
      const notification = getIntelligentNotification(
        habits,
        appSettings.dayResetHour,
        currentHour,
        appSettings.defaultFocusDuration,
        appSettings,
      );

      if (notification) {
        void sendIntelligentNotification(notification, appSettings);
      }
    };

    // Check immediately on mount
    checkNotifications();

    const intervalId = window.setInterval(checkNotifications, 5 * 60 * 1000);

    return () => {
      window.clearInterval(intervalId);
      notificationIntervalRegisteredRef.current = false;
    };
  }, [habits, appSettings]);

  useEffect(() => {
    // Prevent multiple listener registrations
    if (notificationListenerRegisteredRef.current) return;
    notificationListenerRegisteredRef.current = true;

    const routeFocusHabitAction = (detail: NotificationAction | undefined) => {
      if (!detail || detail.type !== "focus-habit") return;

      const habitId = detail.habitId;
      const title = detail.habitName ?? detail.title;
      const durationMinutes = detail.durationMinutes ?? appSettings.defaultFocusDuration;

      setNotificationTimerAction({ habitId, title, durationMinutes });
      setInitialFocusEntityId(
        habitId !== undefined
          ? { habitId, title }
          : title
            ? { title }
            : undefined,
      );
      setView("Timer");
    };

    // Browser fallback path: only the `new Notification()` onclick handler in
    // notificationLogic dispatches this event. It is kept so Focus still
    // starts when running outside Tauri; it is not the native macOS action.
    const handleBrowserNotificationAction = (event: Event) => {
      const detail = (event as CustomEvent<NotificationAction>).detail;
      routeFocusHabitAction(detail);
    };

    window.addEventListener("habit-tracker:notification-action", handleBrowserNotificationAction as EventListener);

    // Native (Tauri/macOS) path: the single supported `onAction` flow.
    // Registration is idempotent; failures outside Tauri fall back silently.
    let nativeUnlisten: (() => void) | null = null;
    let nativeCancelled = false;
    void ensureNotificationActionTypesRegistered()
      .then(() => {
        if (nativeCancelled) return null;
        return subscribeToNativeNotificationActions(routeFocusHabitAction);
      })
      .then((unlisten) => {
        if (nativeCancelled) {
          unlisten?.();
          return;
        }
        nativeUnlisten = unlisten ?? null;
      })
      .catch((error) => {
        console.error("Failed to subscribe to native notification actions", error);
      });
    return () => {
      nativeCancelled = true;
      nativeUnlisten?.();
      nativeUnlisten = null;
      window.removeEventListener("habit-tracker:notification-action", handleBrowserNotificationAction as EventListener);
      notificationListenerRegisteredRef.current = false;
    };
  }, [appSettings.defaultFocusDuration]);

  useEffect(() => {
    if (!habitsPopover) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        filterPopoverRef.current?.contains(target) ||
        categoryPopoverTriggerRef.current?.contains(target) ||
        categoryPopoverRef.current?.contains(target)
      ) {
        return;
      }
      setHabitsPopover(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [habitsPopover]);

  useLayoutEffect(() => {
    shortcutContextRef.current = {
      view,
      editingId,
      toggleTimer: timerShortcutRef.current,
      navigateTo: navigateToView,
      openShortcuts: openKeyboardShortcuts,
      openPalette: openPalette,
      shortcutsBlocked: showKeyboardShortcuts || paletteOpen ||
        focusSessionPendingDeletion !== null || habitPendingDeletion !== null ||
        categoryPendingDeletion !== null,
      setHabitViewMode: changeHabitViewMode,
      focusNewHabit: () => {
        setHabitsPopover(null);
        newHabitInputRef.current?.focus();
      },
      editFocusedHabit: () => {
        if (editingId !== null) return false;
        const activeElement = document.activeElement;
        if (!(activeElement instanceof HTMLElement)) return false;
        const habitElement = activeElement.closest<HTMLElement>("[data-habit-id]");
        if (!habitElement) return false;
        const editButton = habitElement.querySelector<HTMLButtonElement>('button[aria-label^="Edit "]');
        if (!editButton) return false;
        editButton.click();
        return true;
      },
      saveActiveEdit: () => {
        if (editingId === null) return;
        const editRow = document.querySelector<HTMLElement>(`[data-habit-id="${editingId}"]`);
        const saveButton = Array.from(editRow?.querySelectorAll<HTMLButtonElement>("button") ?? [])
          .find((button) => button.textContent?.trim() === "Save");
        if (saveButton && !saveButton.disabled) saveButton.click();
      },
      closeTransient: () => {
        if (paletteOpen) {
          setPaletteOpen(false);
        } else if (focusSessionPendingDeletion) {
          setFocusSessionPendingDeletion(null);
        } else if (habitPendingDeletion) {
          setHabitPendingDeletion(null);
        } else if (categoryPendingDeletion) {
          setCategoryPendingDeletion(null);
        } else if (showKeyboardShortcuts) {
          setShowKeyboardShortcuts(false);
        } else if (editingCustomCategory !== null) {
          cancelCategoryRename();
        } else if (habitsPopover) {
          setHabitsPopover(null);
        } else if (editingId !== null) {
          cancelEdit();
        } else if (showArchived) {
          setShowArchived(false);
        } else {
          return false;
        }
        return true;
      },
    };
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const context = shortcutContextRef.current;
      if (!context) return;
      if (event.key === "Escape") {
        if (context.closeTransient()) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      if (event.defaultPrevented) return;
      if (context.shortcutsBlocked) return;
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const modifier = isMac ? event.metaKey : event.ctrlKey;

      if (modifier) {
        const key = event.key.toLowerCase();
        if (key === "k") {
          event.preventDefault();
          context.openPalette();
          return;
        }
        // The shortcuts modal moved off ⌘K to make room for the palette.
        if (event.key === "/") {
          event.preventDefault();
          context.openShortcuts();
          return;
        }
        if (event.key === "Enter" && context.editingId !== null) {
          event.preventDefault();
          context.saveActiveEdit();
          return;
        }

        const navigationKeys: Record<string, View> = {
          "1": "Today",
          "2": "Habits",
          "3": "Tasks",
          "4": "Timer",
          "5": "goals",
          "6": "History",
          "7": "Analytics",
          ",": "Settings",
        };
        const nextView = navigationKeys[event.key];
        if (nextView) {
          event.preventDefault();
          context.navigateTo(nextView);
        }
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      const isTyping = target instanceof HTMLElement && (
        target.isContentEditable ||
        target.matches("input, textarea, select")
      );
      if (isTyping) return;

      const key = event.key.toLowerCase();
      if ((context.view === "Habits" || context.view === "Today") && (key === "g" || key === "l")) {
        event.preventDefault();
        context.setHabitViewMode(key === "g" ? "grid" : "list");
      } else if (context.view === "Habits" && key === "n") {
        event.preventDefault();
        context.focusNewHabit();
      } else if (key === "e") {
        if (context.editFocusedHabit()) {
          event.preventDefault();
          event.stopPropagation();
        }
      } else if (key === " " && event.code === "Space" && context.view === "Timer" && !event.repeat) {
        const isInteractiveTarget = target instanceof HTMLElement && target.closest(
          "button, a, input, textarea, select, [role='button'], [role='checkbox'], [role='radio'], [role='menuitem'], [contenteditable='true']",
        );
        if (!isInteractiveTarget && context.toggleTimer?.()) {
          event.preventDefault();
          event.stopPropagation();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  const categoriesInUse = Array.from(
    new Set(
      habits
        .map((habit) => habit.category)
        .filter((category): category is string => !!category),
    ),
  ).sort();
  const categoryOptions = Array.from(
    new Set([...customCategories, ...categoriesInUse]),
  ).sort();
  const categoryTabs = [ALL_CATEGORIES, NO_CATEGORY, ...categoriesInUse];
  function navigateToView(nextView: View) {
    const activeElement = document.activeElement;
    const isEditableOrDialog = activeElement instanceof HTMLElement && (
      activeElement.isContentEditable ||
      activeElement.matches("input, textarea, select") ||
      activeElement.closest("[role='dialog']") !== null
    );
    focusTimerAfterNavigationRef.current = nextView === "Timer" && !isEditableOrDialog && (
      activeElement === document.body ||
      (activeElement instanceof HTMLElement && (
        activeElement.closest(".sidebar-item") !== null ||
        activeElement.closest(".main-content") !== null
      ))
    );
    if (nextView === "Timer" && view === "Timer" && focusTimerAfterNavigationRef.current) {
      focusTimerAfterNavigationRef.current = false;
      focusTimerControl();
    }
    if (nextView !== "Timer") setInitialFocusEntityId(undefined);
    setView(nextView);
  }

  function focusTimerControl() {
    document.querySelector<HTMLButtonElement>(".focus-view .focus-primary-control")
      ?.focus({ preventScroll: true });
  }

  useLayoutEffect(() => {
    if (view !== "Timer" || !focusTimerAfterNavigationRef.current) return;
    focusTimerAfterNavigationRef.current = false;
    focusTimerControl();
  }, [view]);

  function changeHabitViewMode(viewMode: "grid" | "list") {
    setAppSettings((current) => ({ ...current, viewMode }));
    setHabitsPopover(null);
  }

  function openKeyboardShortcuts() {
    setShowKeyboardShortcuts(true);
  }

  function openPalette() {
    setPaletteOpen(true);
  }

  function startFocusSession(entityId?: { taskId?: string; habitId?: number; goalId?: string; title?: string }) {
    setInitialFocusEntityId(entityId);
    navigateToView("Timer");
  }

  function focusQuickTaskInput() {
    navigateToView("Today");
    // The Today view stays mounted; wait a frame so it is visible and
    // focusable before moving focus to its quick-add input.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        quickTaskFocusRef.current?.();
      });
    });
  }

  function focusNewHabitInput() {
    navigateToView("Habits");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        newHabitInputRef.current?.focus();
      });
    });
  }

  const currentCategory = categoryTabs.includes(activeCategory)
    ? activeCategory
    : ALL_CATEGORIES;
  const matchesCategory = (habit: Habit) => {
    if (currentCategory === ALL_CATEGORIES) return true;
    if (currentCategory === NO_CATEGORY) return !habit.category;
    return habit.category === currentCategory;
  };

  // Apply all property filters
  const applyPropertyFilters = (habit: Habit) => {
    // Type filter
    // Priority filter
    if (filterPriority !== "All") {
      if (habit.priority !== filterPriority) return false;
    }

    // Frequency filter
    if (filterFrequency !== "All") {
      const freqType = getFrequencyType(habit);
      if (freqType !== filterFrequency) return false;
    }

    // Status filter
    if (filterStatus !== "All") {
      if (filterStatus === "Active" && habit.isArchived) return false;
      if (filterStatus === "Archived" && !habit.isArchived) return false;
      if (filterStatus === "Completed Today" && !habit.completedDates.includes(selectedDateKey)) return false;
      if (filterStatus === "Incomplete Today" && habit.completedDates.includes(selectedDateKey)) return false;
    }

    return true;
  };

  // Count active filters
  const activeFilterCount = [
    filterPriority !== "All",
    filterFrequency !== "All",
    filterStatus !== "All",
  ].filter(Boolean).length;

  // Clear all property filters
  const clearPropertyFilters = () => {
    setFilterPriority("All");
    setFilterFrequency("All");
    setFilterStatus("All");
  };

  function rememberCategory(category: string) {
    if (!category) return;
    setCustomCategories((previous) =>
      previous.includes(category) ? previous : [...previous, category].sort(),
    );
  }

  function startCategoryRename(category: string) {
    setEditingCustomCategory(category);
    setCustomCategoryDraft(category);
  }

  function cancelCategoryRename() {
    setEditingCustomCategory(null);
    setCustomCategoryDraft("");
  }

  function renameCategory(category: string) {
    const nextCategory = normalizeCategory(customCategoryDraft);
    if (!nextCategory || nextCategory === category) {
      cancelCategoryRename();
      return;
    }

    if (customCategories.some((existing) => existing !== category && existing === nextCategory)) {
      return;
    }

    setCustomCategories((previous) =>
      previous.map((existing) => (existing === category ? nextCategory : existing)).sort(),
    );
    const updatedHabits = habits.map((habit) =>
      habit.category === category ? { ...habit, category: nextCategory } : habit,
    );
    setHabits(updatedHabits);
    setActiveCategory((current) => (current === category ? nextCategory : current));
    cancelCategoryRename();
  }

  function deleteCategory(category: string) {
    setCategoryPendingDeletion(category);
  }

  function confirmCategoryDeletion() {
    const category = categoryPendingDeletion;
    if (!category) return;

    setCustomCategories((previous) => previous.filter((existing) => existing !== category));
    const updatedHabits = habits.map((habit) =>
      habit.category === category ? { ...habit, category: undefined } : habit,
    );
    setHabits(updatedHabits);
    setActiveCategory((current) => (current === category ? ALL_CATEGORIES : current));
    if (editingCustomCategory === category) cancelCategoryRename();
    setCategoryPendingDeletion(null);
  }

  function addHabit() {
    const name = newHabit.trim();

    if (name === "") return;

    const category = normalizeCategory(
      newCategory === ADD_CATEGORY_VALUE ? newCategoryName : newCategory,
    );
    rememberCategory(category);

    const habit: Habit = {
      id: createHabitId(),
      name,
      createdAt: getTodayKey(appSettings.dayResetHour),
      goalId: newGoalId || undefined,
      category: category || undefined,
      priority: newPriority,
      type: "Daily",
      frequencyType: newFrequencyType,
      customDays: newFrequencyType === "custom" ? newCustomDays : [],
      completedDates: [],
    };

    setHabits([...habits, habit]);
    setNewHabit("");
    setNewGoalId("");
    setNewPriority("Optional");
    setNewFrequencyType("daily");
    setNewCustomDays([]);
    setNewCategory("");
    setNewCategoryName("");
  }

  function toggleHabit(id: number, dateKey?: string) {
    const targetDateKey = dateKey ?? selectedDateKey;
    const habit = habits.find((h) => h.id === id);
    const isCurrentlyComplete = habit?.completedDates.includes(targetDateKey) ?? false;

    const updatedHabits: Habit[] = habits.map((h): Habit => {
      if (h.id !== id) return h;
      return isCurrentlyComplete
        ? markHabitIncomplete(h, targetDateKey)
        : markHabitComplete(h, targetDateKey);
    });
    setHabits(updatedHabits);

    // Play habit complete sound only when marking complete (not unmarking)
    if (!isCurrentlyComplete) {
      playSfx("habitComplete");
    }
  }

  function toggleHabitFreeze(id: number) {
    const todayKey = getTodayKey(appSettings.dayResetHour);
    const habit = habits.find((h) => h.id === id);
    const isCurrentlyFrozen = habit?.streakFreezeDates?.includes(todayKey) ?? false;

    const updatedHabits: Habit[] = habits.map((h): Habit => {
      if (h.id !== id) return h;

      const streakFreezeDates = isCurrentlyFrozen
        ? (h.streakFreezeDates ?? []).filter((date) => date !== todayKey)
        : [...(h.streakFreezeDates ?? []), todayKey];

      return { ...h, streakFreezeDates };
    });
    setHabits(updatedHabits);
  }

  function requestHabitDeletion(habit: Habit) {
    setHabitPendingDeletion(habit);
  }

  function confirmHabitDeletion() {
    if (!habitPendingDeletion) return;

    setHabits((previous) =>
      previous.filter((habit) => habit.id !== habitPendingDeletion.id),
    );
    setHabitPendingDeletion(null);
  }

  function startEdit(habit: Habit) {
    setEditingId(habit.id);
    setEditingName(habit.name);
    setEditingGoalId(habit.goalId ?? "");
    setEditingPriority(habit.priority);
    setEditingFrequencyType(getFrequencyType(habit));
    setEditingCustomDays(habit.customDays ?? []);
    setEditingCategory(habit.category ?? "");
    setEditingCategoryName("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
    setEditingGoalId("");
    setEditingPriority("Optional");
    setEditingFrequencyType("daily");
    setEditingCustomDays([]);
    setEditingCategory("");
    setEditingCategoryName("");
  }

  function saveEdit(id: number) {
    const name = editingName.trim();
    if (name === "") return;

    const category = normalizeCategory(
      editingCategory === ADD_CATEGORY_VALUE
        ? editingCategoryName
        : editingCategory,
    );
    rememberCategory(category);

    const updatedHabits: Habit[] = habits.map((habit): Habit => {
        if (habit.id !== id) return habit;

        return {
          ...habit,
          name,
          goalId: editingGoalId || undefined,
          priority: editingPriority,
          type: "Daily",
          frequencyType: editingFrequencyType,
          customDays: editingFrequencyType === "custom" ? editingCustomDays : [],
          category,
        };
      });
    setHabits(updatedHabits);
    cancelEdit();
  }

  function addFocusSessionRecord(
    sessionType: "Timer" | "Pomodoro Focus",
    durationMinutes: number,
    habitName: string,
    goalId?: string,
    milestoneId?: string,
    taskId?: string,
    habitId?: number,
  ) {
    // Resolve the Project behind the logged session through its Task or Milestone.
    const newRecord: FocusSessionRecord = buildFocusSessionRecord(
      { sessionType, durationMinutes, habitName, habitId, goalId, milestoneId, taskId },
      { tasks, milestones },
      { id: Date.now(), timestamp: Date.now() },
    );
    setFocusSessions((prev) => [...prev, newRecord]);
  }

  function handleCompleteTaskFromFocus(taskId: string) {
    setTasks((current) => current.map((task) =>
      task.id === taskId ? completeTask(task) : task,
    ));
  }

  function deleteFocusSession(id: number) {
    setFocusSessions((prev) => prev.filter((session) => session.id !== id));
  }

  function requestFocusSessionDeletion(id: number) {
    const session = focusSessions.find((item) => item.id === id);
    if (!session) return;
    setFocusSessionPendingDeletion(session);
  }

  function confirmFocusSessionDeletion() {
    if (!focusSessionPendingDeletion) return;

    deleteFocusSession(focusSessionPendingDeletion.id);
    setFocusSessionPendingDeletion(null);
  }

  function archiveHabit(id: number) {
    const updatedHabit = habits.find((habit) => habit.id === id);
    if (!updatedHabit) return;
    const archivedHabit = { ...updatedHabit, isArchived: true };
    setHabits(habits.map((habit) => (habit.id === id ? archivedHabit : habit)));
  }

  function unarchiveHabit(id: number) {
    const updatedHabit = habits.find((habit) => habit.id === id);
    if (!updatedHabit) return;
    const activeHabit = { ...updatedHabit, isArchived: false };
    setHabits(habits.map((habit) => (habit.id === id ? activeHabit : habit)));
  }

  const filteredHabits = habits.filter((habit) => matchesCategory(habit) && applyPropertyFilters(habit));
  const activeHabits = filteredHabits.filter(
    (habit) => !habit.isArchived && isHabitScheduledOnDate(habit, selectedDateKey),
  );
  const offDayHabits = filteredHabits.filter(
    (habit) => !habit.isArchived && !isHabitScheduledOnDate(habit, selectedDateKey),
  );
  const archivedHabits = filteredHabits.filter((habit) => habit.isArchived);
  const summary = computeSummary(activeHabits, selectedDateKey);

  function renderFrequencyControls(
    frequencyType: FrequencyType,
    setFrequencyType: (value: FrequencyType) => void,
    customDays: string[],
    setCustomDays: (value: string[]) => void,
    selectStyle: CSSProperties = styles.select,
  ) {
    return (
      <>
        <select
          style={selectStyle}
          value={frequencyType}
          onChange={(event) => setFrequencyType(event.target.value as FrequencyType)}
          aria-label="Frequency"
        >
          <option value="daily">Every Day</option>
          <option value="weekdays">Weekdays</option>
          <option value="weekends">Weekends</option>
          <option value="custom">Custom Days</option>
        </select>
        {frequencyType === "custom" && (
          <div style={styles.frequencyDays} aria-label="Custom Frequency Days">
            {WEEKDAYS.map((day) => {
              const selected = customDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  style={{
                    ...styles.frequencyDay,
                    ...(selected ? styles.frequencyDayActive : {}),
                  }}
                  onClick={() =>
                    setCustomDays(
                      selected
                        ? customDays.filter((selectedDay) => selectedDay !== day)
                        : [...customDays, day],
                    )
                  }
                  aria-label={day}
                  aria-pressed={selected}
                  title={day}
                >
                  {day[0]}
                </button>
              );
            })}
          </div>
        )}
      </>
    );
  }

  function renderCategorySelect(
    value: string,
    onChange: (nextValue: string) => void,
    customName: string,
    onCustomNameChange: (nextValue: string) => void,
    selectStyle: CSSProperties,
    inputStyle: CSSProperties,
  ) {
    return (
      <>
        <select
          style={selectStyle}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label="Category"
        >
          <option value="">No Category</option>
          {categoryOptions.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
          <option value={ADD_CATEGORY_VALUE}>+ Add Custom Category...</option>
        </select>
        {value === ADD_CATEGORY_VALUE && (
          <input
            style={inputStyle}
            value={customName}
            onChange={(event) => onCustomNameChange(event.target.value)}
            placeholder="New Category Name"
            aria-label="New Category Name"
            autoFocus
          />
        )}
      </>
    );
  }

  function renderHabitRow(
    habit: Habit,
    completed: boolean,
    isArchived = false,
    isScheduled = true,
  ) {
    const doneOnSelectedDate = habit.completedDates.includes(selectedDateKey);
    const streak = calculateStreak(habit, streakFreeze, appSettings.dayResetHour);
    const isEditing = editingId === habit.id;
    const todayKey = getTodayKey(appSettings.dayResetHour);
    const isFrozen = habit.streakFreezeDates?.includes(todayKey) ?? false;

    const rowColorStyle = completed ? styles.itemCompletedColors : styles.itemColors;
    const archivedStyle = isArchived ? { opacity: 0.6 } : {};

    if (isEditing) {
      return (
        <li
          key={habit.id}
          data-habit-id={habit.id}
          className={`habit-row${appSettings.viewMode === "grid" ? " habit-grid-edit-row" : ""}`}
          style={{
            ...rowColorStyle,
            ...(appSettings.viewMode === "grid" ? styles.gridEditRow : {}),
          }}
        >
          <div style={styles.editRow}>
            <div className="habit-edit-fields" style={styles.editFieldsRow}>
              <input
                style={styles.editInput}
                value={editingName}
                autoFocus
                onChange={(event) => setEditingName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.metaKey && !event.ctrlKey) saveEdit(habit.id);
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    cancelEdit();
                  }
                }}
              />
              <select
                style={styles.editSelect}
                value={editingPriority}
                onChange={(event) =>
                  setEditingPriority(event.target.value as Priority)
                }
                aria-label="Priority"
              >
                <option value="Optional">Optional</option>
                <option value="Mandatory">Mandatory</option>
              </select>
              {renderFrequencyControls(
                editingFrequencyType,
                setEditingFrequencyType,
                editingCustomDays,
                setEditingCustomDays,
                styles.editSelect,
              )}
              {renderCategorySelect(
                editingCategory,
                setEditingCategory,
                editingCategoryName,
                setEditingCategoryName,
                styles.editSelect,
                styles.editInput,
              )}
              <select
                style={styles.editSelect}
                value={editingGoalId}
                onChange={(event) => setEditingGoalId(event.target.value)}
                aria-label="Linked Goal"
              >
                <option value="">No Goal</option>
                {goals.map((goal) => (
                  <option key={goal.id} value={goal.id}>{goal.title}</option>
                ))}
              </select>
            </div>
            <div className="habit-cell-actions">
              <button
                style={styles.saveButton}
                onClick={() => saveEdit(habit.id)}
              >
                Save
              </button>
              <button style={styles.cancelButton} onClick={cancelEdit}>
                Cancel
              </button>
            </div>
          </div>
        </li>
      );
    }

    return (
      <li
        key={habit.id}
        data-habit-id={habit.id}
        tabIndex={0}
        className="habit-row"
        style={{ ...rowColorStyle, ...archivedStyle }}
      >
        <div className="habit-info-cluster">
          <div className="habit-cell-name">
            <span
              style={{
                ...styles.habitName,
                ...(doneOnSelectedDate || completed ? styles.habitNameDone : {}),
              }}
            >
              {habit.name}
            </span>
            {(doneOnSelectedDate || completed) && (
              <span className="habit-completion-state">
                <Check size={12} aria-hidden="true" />
                Done
              </span>
            )}
            {habit.category && (
              <span style={styles.categoryBadge}>{habit.category}</span>
            )}
          </div>

          <span
            className="priority-badge"
            style={{
              ...styles.priorityBadge,
              ...(habit.priority === "Mandatory"
                ? styles.priorityMandatory
                : styles.priorityOptional),
            }}
          >
            {habit.priority}
          </span>

          <div className="habit-type-cell">
            <span
              className="habit-type-badge"
              style={isScheduled ? styles.dailyBadge : styles.offDayBadge}
            >
              {isScheduled ? formatFrequencyLabel(habit) : "Off Day"}
            </span>
          </div>

          <StreakBadge className="my-habits-streak" streak={streak} />
        </div>

        <div className="habit-cell-actions">
          {!completed && !isArchived && isScheduled && (
            <button
              style={{
                ...styles.habitCompletionButton,
                ...(doneOnSelectedDate ? styles.toggleButtonDone : {}),
              }}
              onClick={() => toggleHabit(habit.id)}
            >
              {doneOnSelectedDate ? (
                <>
                  <Check size={13} style={{ display: "block" }} />
                  Done
                </>
              ) : (
                "Mark Done"
              )}
            </button>
          )}
          <div className="habit-icon-group">
            <button
              style={{
                ...styles.freezeButton,
                ...(isFrozen ? styles.freezeButtonActive : {}),
              }}
              onClick={() => toggleHabitFreeze(habit.id)}
              aria-label={isFrozen ? `Unfreeze "${habit.name}"` : `Freeze "${habit.name}"`}
              title={isFrozen ? "Unfreeze - Remove streak protection for today" : "Freeze - Protect streak for today"}
            >
              <Snowflake size={14} />
            </button>
            <button
              style={styles.iconButton}
              onClick={() => startEdit(habit)}
              aria-label={`Edit "${habit.name}"`}
            >
              <Pencil size={14} />
            </button>
            {!isArchived ? (
              <button
                style={styles.archiveButton}
                onClick={() => archiveHabit(habit.id)}
                aria-label={`Archive "${habit.name}"`}
              >
                <Archive size={14} />
              </button>
            ) : (
              <button
                style={styles.archiveButton}
                onClick={() => unarchiveHabit(habit.id)}
                aria-label={`Unarchive "${habit.name}"`}
              >
                <ArchiveRestore size={14} />
              </button>
            )}
            <button
              style={styles.iconButton}
              onClick={() => requestHabitDeletion(habit)}
              aria-label={`Delete "${habit.name}"`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </li>
    );
  }

  function renderHabitGridCard(
    habit: Habit,
    isArchived = false,
    isScheduled = true,
  ) {
    const doneOnSelectedDate = habit.completedDates.includes(selectedDateKey);
    const progress = doneOnSelectedDate ? 100 : 0;
    const streak = calculateStreak(habit, streakFreeze, appSettings.dayResetHour);
    const todayKey = getTodayKey(appSettings.dayResetHour);
    const isFrozen = habit.streakFreezeDates?.includes(todayKey) ?? false;

    return (
      <li
        key={habit.id}
        data-habit-id={habit.id}
        tabIndex={0}
        className="habit-grid-card"
        style={{ ...styles.habitGridCard, ...(isArchived ? { opacity: 0.65 } : {}) }}
      >
        <div style={styles.gridCardTop}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={styles.gridCardName} title={habit.name}>{habit.name}</div>
            {habit.category && <span style={styles.categoryBadge}>{habit.category}</span>}
          </div>
          <span
            style={{
              ...styles.priorityBadge,
              ...(habit.priority === "Mandatory" ? styles.priorityMandatory : styles.priorityOptional),
            }}
          >
            {habit.priority}
          </span>
        </div>

        <div style={styles.gridCardMiddle}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>
              {formatFrequencyLabel(habit)}
            </div>
            <div style={styles.gridProgressTrack}>
              <div style={{ ...styles.gridProgressFill, width: `${progress}%` }} />
            </div>
          </div>
          <StreakBadge className="my-habits-streak" streak={streak} />
        </div>

        <div style={styles.gridCardBottom}>
          <button
            type="button"
            style={{
              ...styles.habitCompletionButton,
              ...(doneOnSelectedDate ? styles.toggleButtonDone : {}),
            }}
            onClick={() => toggleHabit(habit.id)}
            disabled={isArchived || !isScheduled}
            aria-pressed={doneOnSelectedDate}
          >
            {isArchived ? "Archived" : !isScheduled ? "Off Day" : doneOnSelectedDate ? "✓ Done" : "Mark Complete"}
          </button>
          <div className="habit-icon-group">
            <button
              style={{
                ...styles.freezeButton,
                ...(isFrozen ? styles.freezeButtonActive : {}),
              }}
              onClick={() => toggleHabitFreeze(habit.id)}
              aria-label={isFrozen ? `Unfreeze "${habit.name}"` : `Freeze "${habit.name}"`}
              title={isFrozen ? "Unfreeze - Remove streak protection for today" : "Freeze - Protect streak for today"}
            >
              <Snowflake size={14} />
            </button>
            <button style={styles.iconButton} onClick={() => startEdit(habit)} aria-label={`Edit "${habit.name}"`}>
              <Pencil size={14} />
            </button>
            {isArchived ? (
              <button style={styles.archiveButton} onClick={() => unarchiveHabit(habit.id)} aria-label={`Unarchive "${habit.name}"`}>
                <ArchiveRestore size={14} />
              </button>
            ) : (
              <button style={styles.archiveButton} onClick={() => archiveHabit(habit.id)} aria-label={`Archive "${habit.name}"`}>
                <Archive size={14} />
              </button>
            )}
            <button style={styles.iconButton} onClick={() => requestHabitDeletion(habit)} aria-label={`Delete "${habit.name}"`}>
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </li>
    );
  }

  const paletteCommands: PaletteCommand[] = [
    { id: "go-today", label: "Go to Today", hint: `${shortcutKey}1`, keywords: "navigate view" },
    { id: "go-habits", label: "Go to My Habits", hint: `${shortcutKey}2`, keywords: "navigate view habits" },
    { id: "go-tasks", label: "Go to Tasks", hint: `${shortcutKey}3`, keywords: "navigate view tasks" },
    { id: "go-timer", label: "Go to Timer", hint: `${shortcutKey}4`, keywords: "navigate view focus timer" },
    { id: "go-goals", label: "Go to Goals", hint: `${shortcutKey}5`, keywords: "navigate view goals" },
    { id: "go-history", label: "Go to History", hint: `${shortcutKey}6`, keywords: "navigate view history" },
    { id: "go-analytics", label: "Go to Analytics", hint: `${shortcutKey}7`, keywords: "navigate view analytics" },
    { id: "open-settings", label: "Open Settings", hint: `${shortcutKey},`, keywords: "navigate preferences settings" },
    { id: "add-task", label: "Add Task", keywords: "create new task today" },
    { id: "add-habit", label: "Add Habit", keywords: "create new habit" },
    { id: "start-focus", label: "Start Focus", keywords: "timer pomodoro begin focus" },
  ];

  function runPaletteCommand(commandId: string) {
    setPaletteOpen(false);
    switch (commandId) {
      case "go-today":
        navigateToView("Today");
        break;
      case "go-habits":
        navigateToView("Habits");
        break;
      case "go-tasks":
        navigateToView("Tasks");
        break;
      case "go-timer":
        navigateToView("Timer");
        break;
      case "go-goals":
        navigateToView("goals");
        break;
      case "go-history":
        navigateToView("History");
        break;
      case "go-analytics":
        navigateToView("Analytics");
        break;
      case "open-settings":
        navigateToView("Settings");
        break;
      case "add-task":
        focusQuickTaskInput();
        break;
      case "add-habit":
        focusNewHabitInput();
        break;
      case "start-focus":
        startFocusSession(undefined);
        break;
      default:
        break;
    }
  }

  return (
    <div className="app-shell">
      <div className="app-body">
        <nav className="sidebar" aria-label="Main Navigation">
          <div className="sidebar-primary" role="group" aria-label="Workspace">
            <button
              className={`sidebar-item ${view === "Today" ? "active" : ""}`}
              onClick={() => navigateToView("Today")}
              aria-current={view === "Today" ? "page" : undefined}
            >
              <CalendarDays size={18} />
              <span>Today</span>
              <span className="sidebar-shortcut">{shortcutKey}1</span>
            </button>
          <button
            className={`sidebar-item ${view === "Habits" ? "active" : ""}`}
            onClick={() => navigateToView("Habits")}
            aria-current={view === "Habits" ? "page" : undefined}
          >
            <ListChecks size={18} />
            <span>My Habits</span>
            <span className="sidebar-shortcut">{shortcutKey}2</span>
          </button>
          <button
            className={`sidebar-item ${view === "Tasks" ? "active" : ""}`}
            onClick={() => navigateToView("Tasks")}
            aria-current={view === "Tasks" ? "page" : undefined}
          >
            <ListTodo size={18} />
            <span>Tasks</span>
            <span className="sidebar-shortcut">{shortcutKey}3</span>
          </button>
<button
              className={`sidebar-item ${view === "Timer" ? "active" : ""}`}
              onClick={() => navigateToView("Timer")}
              aria-current={view === "Timer" ? "page" : undefined}
            >
              <TimerIcon size={18} />
              <span>Timer</span>
              <span className="sidebar-shortcut">{shortcutKey}4</span>
            </button>
            <button
              className={`sidebar-item ${view === "goals" ? "active" : ""}`}
              onClick={() => navigateToView("goals")}
              aria-current={view === "goals" ? "page" : undefined}
            >
              <Target size={18} />
              <span>Goals</span>
              <span className="sidebar-shortcut">{shortcutKey}5</span>
            </button>
          <button
            className={`sidebar-item ${view === "History" ? "active" : ""}`}
            onClick={() => navigateToView("History")}
            aria-current={view === "History" ? "page" : undefined}
          >
            <HistoryIcon size={18} />
            <span>History</span>
            <span className="sidebar-shortcut">{shortcutKey}6</span>
          </button>
          <button
            className={`sidebar-item ${view === "Analytics" ? "active" : ""}`}
            onClick={() => navigateToView("Analytics")}
            aria-current={view === "Analytics" ? "page" : undefined}
          >
            <BarChart3 size={18} />
            <span>Analytics</span>
            <span className="sidebar-shortcut">{shortcutKey}7</span>
          </button>
          </div>
          <div className="sidebar-spacer" />
          <div className="sidebar-utility" role="group" aria-label="Preferences">
            <button
              className={`sidebar-item ${view === "Settings" ? "active" : ""}`}
              onClick={() => navigateToView("Settings")}
              aria-current={view === "Settings" ? "page" : undefined}
            >
              <Settings size={18} />
              <span>Settings</span>
              <span className="sidebar-shortcut">{shortcutKey},</span>
            </button>
          </div>
        </nav>

        <main className="main-content">
          {/* Both views stay mounted at all times — only visibility is
              toggled — so the Focus Timer's interval and state are
              never interrupted by switching sidebar tabs. */}
          <div
            style={{
              display: view === "Today" ? "flex" : "none",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
            }}
          >
            <Today
              viewMode={appSettings.viewMode}
              habits={habits}
              tasks={tasks}
              goals={goals}
              milestones={milestones}
              projects={projects}
              focusSessions={focusSessions}
              onToggleHabit={(id, dateKey) => toggleHabit(id, dateKey)}
              onToggleTask={handleToggleTask}
              onAddTask={handleAddTask}
              onQuickTaskFocusReady={(focus) => {
                quickTaskFocusRef.current = focus;
              }}
              onStartFocus={(entityId) => {
                startFocusSession(entityId);
              }}
              onNavigateToHabits={() => navigateToView("Habits")}
              onNavigateToGoals={() => navigateToView("goals")}
              onNavigateToHistory={() => navigateToView("History")}
              onNavigateToAnalytics={() => navigateToView("Analytics")}
              streakFreeze={streakFreeze}
              dayResetHour={appSettings.dayResetHour}
              showMandatoryHabitsInImportantItems={appSettings.showMandatoryHabitsInImportantItems ?? false}
              onUpdateHabit={(updatedHabit) =>
                setHabits((current) => current.map((habit) =>
                  habit.id === updatedHabit.id ? updatedHabit : habit,
                ))
              }
              onUpdateTask={(updatedTask) =>
                setTasks((current) => current.map((task) =>
                  task.id === updatedTask.id ? updatedTask : task,
                ))
              }
            />
          </div>

          <div style={{ display: view === "Habits" ? "block" : "none" }}>
            <h1 style={styles.h1}>My Habits</h1>
            <p style={styles.subtitle}>Small steps count.</p>

            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
              <button
                style={{
                  ...styles.streakFreezeToggle,
                  ...(streakFreeze ? styles.streakFreezeToggleActive : {}),
                }}
                onClick={() => setStreakFreeze(!streakFreeze)}
                aria-pressed={streakFreeze}
              >
                <Snowflake size={14} />
                {streakFreeze ? "Streak Freeze ON" : "Streak Freeze OFF"}
              </button>
            </div>

<div className="date-navigator" style={styles.dateNavigator}>
  <button
    style={styles.dateButton}
    onClick={() => setSelectedDateKey((date) => shiftDateKey(date, -1))}
  >
    <ChevronLeft size={14} />
    Day Before
  </button>
  <button
    style={styles.dateButton}
    onClick={() => setSelectedDateKey(getTodayKey(appSettings.dayResetHour))}
  >
    Today
  </button>
  <button
    style={styles.dateButton}
    onClick={() => setSelectedDateKey((date) => shiftDateKey(date, 1))}
  >
    Day After
    <ChevronRight size={14} />
  </button>
</div>

            <div style={styles.currentDateLabel}>
              {formatDateDisplay(selectedDateKey, appSettings.dayResetHour)}
              {streakFreeze && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    verticalAlign: "middle",
                    color: "var(--accent-teal)",
                  }}
                >
                  <Snowflake size={14} />
                </span>
              )}
            </div>

            {summary.total > 0 && (
              <div style={styles.summary}>
                <span style={styles.summaryPrimary}>
                  {summary.doneCount} of {summary.total} Complete ·{" "}
                  {summary.percent}%
                </span>
                {summary.mandatoryTotal > 0 && (
                  <span style={styles.summarySecondary}>
                    {summary.mandatoryDone} of {summary.mandatoryTotal}{" "}
                    Mandatory done
                  </span>
                )}
              </div>
            )}

            <div className="category-section">
              <div className="category-tabs" role="group" aria-label="Filter Habits by Category">
                {categoryTabs.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`category-tab ${currentCategory === tab ? "active" : ""}`}
                    onClick={() => setActiveCategory(tab)}
                    aria-pressed={currentCategory === tab}
                  >
                    {tab}
                  </button>
                ))}
                <div
                  className="category-settings"
                  style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}
                >
                  <div ref={filterPopoverRef} style={{ position: "relative" }}>
                    <button
                      type="button"
                      style={{
                        ...styles.categoryManageButton,
                        width: "auto",
                        gap: 7,
                        padding: "0 10px",
                      }}
                      onClick={() => setHabitsPopover((current) => current === "filter" ? null : "filter")}
                      aria-label={activeFilterCount > 0 ? `Filter habits (${activeFilterCount})` : "Filter habits"}
                      aria-expanded={habitsPopover === "filter"}
                      title={activeFilterCount > 0 ? `Filter (${activeFilterCount})` : "Filter habits"}
                    >
                      <Filter size={16} />
                      <span style={{ fontSize: 12 }}>Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}</span>
                    </button>
                    {habitsPopover === "filter" && (
                      <div style={{
                      position: "absolute",
                      top: "calc(100% + 8px)",
                      left: "50%",
                      transform: "translateX(-50%)",
                      zIndex: 50,
                      display: "flex",
                      flexDirection: "column",
                      gap: 16,
                      width: "min(90vw, 440px)",
                      maxWidth: 440,
                      maxHeight: "min(72vh, 640px)",
                      padding: 16,
                      overflowY: "auto",
                      boxSizing: "border-box",
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border-strong)",
                      borderRadius: 10,
                      boxShadow: "0 12px 28px var(--shadow-medium)",
                    }}>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 8 }}>
                          Priority
                        </label>
                        <select
                          style={{ ...styles.select, width: "100%", minWidth: 0 }}
                          value={filterPriority}
                          onChange={(event) => setFilterPriority(event.target.value as "All" | "Mandatory" | "Optional")}
                        >
                          <option value="All">All</option>
                          <option value="Mandatory">Mandatory</option>
                          <option value="Optional">Optional</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 8 }}>
                          Frequency
                        </label>
                        <select
                          style={{ ...styles.select, width: "100%", minWidth: 0 }}
                          value={filterFrequency}
                          onChange={(event) => setFilterFrequency(event.target.value as "All" | "daily" | "weekdays" | "weekends")}
                        >
                          <option value="All">All</option>
                          <option value="daily">Every Day</option>
                          <option value="weekdays">Weekdays</option>
                          <option value="weekends">Weekends</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 8 }}>
                          Status
                        </label>
                        <select
                          style={{ ...styles.select, width: "100%", minWidth: 0 }}
                          value={filterStatus}
                          onChange={(event) => setFilterStatus(event.target.value as "All" | "Active" | "Archived" | "Completed Today" | "Incomplete Today")}
                        >
                          <option value="All">All</option>
                          <option value="Active">Active</option>
                          <option value="Archived">Archived</option>
                          <option value="Completed Today">Completed Today</option>
                          <option value="Incomplete Today">Incomplete Today</option>
                        </select>
                      </div>
                      {activeFilterCount > 0 && (
                        <button
                          style={{
                            ...styles.addButton,
                            background: "transparent",
                            border: "1px solid var(--border-strong)",
                            color: "var(--text-secondary)",
                            fontSize: 12,
                            padding: "8px 12px",
                          }}
                          onClick={clearPropertyFilters}
                        >
                          Reset Filters
                        </button>
                      )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    style={styles.categoryManageButton}
                    ref={categoryPopoverTriggerRef}
                    onClick={() => setHabitsPopover((current) => current === "category" ? null : "category")}
                    aria-label="Manage Custom Categories"
                    aria-expanded={habitsPopover === "category"}
                    title="Manage Custom Categories"
                  >
                    <Settings size={16} />
                  </button>
                </div>
              </div>
              {habitsPopover === "category" && (
                <div ref={categoryPopoverRef} style={styles.categoryManager}>
                  <strong style={{ color: "var(--text-primary)", fontSize: 13 }}>
                    Custom Categories
                  </strong>
                  {customCategories.length === 0 ? (
                    <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                      Add a category from the habit form to manage it here.
                    </span>
                  ) : (
                    customCategories.map((category) => (
                      <div key={category} style={styles.categoryManagerRow}>
                        {editingCustomCategory === category ? (
                          <input
                            style={{ ...styles.input, minWidth: 0 }}
                            value={customCategoryDraft}
                            onChange={(event) => setCustomCategoryDraft(event.target.value)}
                            aria-label={`Rename ${category}`}
                            autoFocus
                          />
                        ) : (
                          <span style={styles.categoryManagerName}>{category}</span>
                        )}
                        {editingCustomCategory === category ? (
                          <>
                            <button
                              style={styles.saveButton}
                              onClick={() => renameCategory(category)}
                            >
                              Save
                            </button>
                            <button style={styles.cancelButton} onClick={cancelCategoryRename}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            style={styles.iconButton}
                            onClick={() => startCategoryRename(category)}
                            aria-label={`Rename ${category}`}
                            title={`Rename ${category}`}
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        <button
                          style={styles.iconButton}
                          onClick={() => deleteCategory(category)}
                          aria-label={`Delete "${category}"`}
                          title={`Delete "${category}"`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div style={{ ...styles.inputRow, justifyContent: "center", margin: "12px auto", maxWidth: 500 }}>
              <input
                ref={newHabitInputRef}
                style={styles.input}
                value={newHabit}
                onChange={(event) => setNewHabit(event.target.value)}
                placeholder="Add a Habit"
              />
              <button
                style={styles.addButton}
                onClick={addHabit}
              >
                Add
              </button>
            </div>

            <div style={{ ...styles.optionsRow, justifyContent: "center", margin: "12px 0 32px" }}>
              <select
                style={styles.habitPropertySelect}
                value={newPriority}
                onChange={(event) =>
                  setNewPriority(event.target.value as Priority)
                }
                aria-label="Priority"
              >
                <option value="Optional">Optional</option>
                <option value="Mandatory">Mandatory</option>
              </select>
              {renderFrequencyControls(
                newFrequencyType,
                setNewFrequencyType,
                newCustomDays,
                setNewCustomDays,
                styles.habitPropertySelect,
              )}
              {renderCategorySelect(
                newCategory,
                setNewCategory,
                newCategoryName,
                setNewCategoryName,
                styles.habitPropertySelect,
                styles.categoryInput,
              )}
              <select
                style={styles.habitPropertySelect}
                value={newGoalId}
                onChange={(event) => setNewGoalId(event.target.value)}
                aria-label="Linked Goal"
              >
                <option value="">No Goal</option>
                {goals.map((goal) => (
                  <option key={goal.id} value={goal.id}>{goal.title}</option>
                ))}
              </select>
            </div>

            {activeHabits.length === 0 && offDayHabits.length === 0 ? (
              <p style={styles.empty}>
                {activeFilterCount > 0
                  ? "No habits match these filters."
                  : habits.length === 0
                  ? "No habits yet — add your first one above."
                  : currentCategory !== ALL_CATEGORIES && !habits.some(matchesCategory)
                  ? `No habits in ${currentCategory} yet.`
                  : archivedHabits.length > 0
                  ? "No active habits. Show archived habits below to restore them."
                  : "No habits active on this date."}
                {activeFilterCount > 0 && (
                  <button
                    style={{
                      ...styles.addButton,
                      background: "transparent",
                      border: "1px solid var(--border-strong)",
                      color: "var(--text-secondary)",
                      fontSize: 12,
                      padding: "8px 12px",
                      marginTop: 8,
                    }}
                    onClick={clearPropertyFilters}
                  >
                    Clear filters
                  </button>
                )}
              </p>
            ) : (
              <div>
                {activeHabits.length > 0 && (
                  <>
                    {appSettings.viewMode === "list" && (
                      <div className="habit-table-header" style={styles.tableHeaderColors}>
                        <span>Habit Name</span>
                        <span>Priority</span>
                        <span className="habit-type-cell">Type / Progress</span>
                        <span className="habit-streak-header">Streak</span>
                        <span style={styles.headerActionsCell}>Actions</span>
                      </div>
                    )}

                    <ul style={{ ...styles.list, ...(appSettings.viewMode === "grid" ? styles.habitGridList : {}) }}>
                      {activeHabits.map((habit) => appSettings.viewMode === "grid" && editingId !== habit.id
                        ? renderHabitGridCard(habit)
                        : renderHabitRow(habit, false, false))}
                    </ul>
                  </>
                )}

                {offDayHabits.length > 0 && (
                  <div style={{ marginTop: activeHabits.length > 0 ? 32 : 0 }}>
                    <h2 style={styles.sectionHeader}>Not Scheduled Today</h2>
                    {appSettings.viewMode === "list" && (
                      <div className="habit-table-header" style={styles.tableHeaderColors}>
                        <span>Habit Name</span>
                        <span>Priority</span>
                        <span className="habit-type-cell">Type / Progress</span>
                        <span className="habit-streak-header">Streak</span>
                        <span style={styles.headerActionsCell}>Actions</span>
                      </div>
                    )}
                    <ul style={{ ...styles.list, ...(appSettings.viewMode === "grid" ? styles.habitGridList : {}) }}>
                      {offDayHabits.map((habit) => appSettings.viewMode === "grid" && editingId !== habit.id
                        ? renderHabitGridCard(habit, false, false)
                        : renderHabitRow(habit, false, false, false))}
                    </ul>
                  </div>
                )}

              </div>
            )}

            {/* Archived Habits Section */}
            {archivedHabits.length > 0 && (
              <div style={{ marginTop: 32 }}>
                <button
                  style={{
                    ...styles.toggleButton,
                    marginBottom: 16,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                  onClick={() => setShowArchived(!showArchived)}
                >
                  <Archive size={14} />
                  {showArchived ? "Hide" : "Show"} Archived Habits ({archivedHabits.length})
                </button>

                {showArchived && (
                  <div>
                    {appSettings.viewMode === "list" && (
                      <div className="habit-table-header" style={styles.tableHeaderColors}>
                        <span>Habit Name</span>
                        <span>Priority</span>
                        <span className="habit-type-cell">Type / Progress</span>
                        <span className="habit-streak-header">Streak</span>
                        <span style={styles.headerActionsCell}>Actions</span>
                      </div>
                    )}

                    <ul style={{ ...styles.list, ...(appSettings.viewMode === "grid" ? styles.habitGridList : {}) }}>
                      {archivedHabits.map((habit) => appSettings.viewMode === "grid" && editingId !== habit.id
                        ? renderHabitGridCard(habit, true)
                        : renderHabitRow(habit, false, true))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <div
            style={{
              display: view === "Tasks" ? "flex" : "none",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
            }}
          >
            <Tasks
              tasks={tasks}
              goals={goals}
              milestones={milestones}
              projects={projects}
              dayResetHour={appSettings.dayResetHour}
              onAddTask={handleAddTask}
              onEditTask={handleEditTask}
              onDeleteTask={handleDeleteTask}
              onToggleTask={handleToggleTask}
              onStartFocus={(entityId) => {
                startFocusSession(entityId);
              }}
            />
          </div>

          <div
            className="focus-view"
            style={{
              ...styles.timerCenter,
              display: view === "Timer" ? "flex" : "none",
            }}
          >
            <FocusTimer
              habits={habits}
              focusSessions={focusSessions}
              onSessionComplete={addFocusSessionRecord}
              defaultFocusDuration={appSettings.defaultFocusDuration}
              dayResetHour={appSettings.dayResetHour}
              quickAdjustStepMinutes={appSettings.quickAdjustStepMinutes}
              onQuickAdjustStepChange={(minutes) =>
                setAppSettings((current) => ({ ...current, quickAdjustStepMinutes: minutes }))
              }
              goals={goals}
              milestones={milestones}
              tasks={tasks}
              projects={projects}
              onCompleteTask={handleCompleteTaskFromFocus}
              allHabits={habits}
              initialEntityId={initialFocusEntityId}
              autoStartAction={notificationTimerAction}
              onAutoStartHandled={() => setNotificationTimerAction(null)}
              onTimerShortcutReady={registerTimerShortcut}
            />
          </div>

          <div
            style={{
              display: view === "History" ? "flex" : "none",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
            }}
          >
            <History
              habits={habits}
              focusSessions={focusSessions}
              viewMode={appSettings.viewMode}
              onRequestDeleteFocusSession={requestFocusSessionDeletion}
              streakFreeze={streakFreeze}
              dayResetHour={appSettings.dayResetHour}
              weekStart={appSettings.weekStart}
            />
          </div>

          <div
            className="analytics-view"
            style={{
              display: view === "Analytics" ? "flex" : "none",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
            }}
          >
            <Analytics
              habits={habits}
              tasks={tasks}
              goals={goals}
              focusSessions={focusSessions}
              streakFreeze={streakFreeze}
              dayResetHour={appSettings.dayResetHour}
              weekStart={appSettings.weekStart}
            />
          </div>

          <div
            style={{
              display: view === "goals" ? "flex" : "none",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
            }}
          >
            <Goals
              goals={goals}
              tasks={tasks}
              habits={habits}
              focusSessions={focusSessions}
              streakFreeze={streakFreeze}
              dayResetHour={appSettings.dayResetHour}
              milestones={milestones}
              onAddGoal={(data) => setGoals((current) => [...current, createGoal(data)])}
              onToggleGoalArchive={(goalId) =>
                setGoals((current) => current.map((goal) =>
                  goal.id === goalId
                    ? updateGoalStatus(goal, goal.status === "archived" ? "active" : "archived")
                    : goal,
                ))
              }
              onEditGoal={(goalId, data) =>
                setGoals((current) => current.map((goal) =>
                  goal.id === goalId ? updateGoal(goal, data) : goal,
                ))
              }
              onDeleteGoal={(goalId) => {
                const deletedMilestoneIds = new Set(
                  milestones.filter((milestone) => milestone.goalId === goalId).map((milestone) => milestone.id),
                );
                const deletedTaskIds = new Set(
                  tasks
                    .filter((task) => task.goalId === goalId || (task.milestoneId && deletedMilestoneIds.has(task.milestoneId)))
                    .map((task) => task.id),
                );
                setFocusSessions((current) => disassociateGoalFocusSessions(
                  current,
                  goalId,
                  deletedMilestoneIds,
                  deletedTaskIds,
                ));
                setGoals((current) => current.filter((goal) => goal.id !== goalId));
                setTasks((current) => current.filter((task) =>
                  task.goalId !== goalId && !(task.milestoneId && deletedMilestoneIds.has(task.milestoneId)),
                ));
                setMilestones((current) => current.filter((milestone) => milestone.goalId !== goalId));
                setProjects((current) => detachGoalFromProjects(current, goalId));
                setHabits((current) => detachHabitsFromDeletedGoal(current, goalId));
              }}              onAddMilestone={handleAddMilestone}
              onEditMilestone={handleEditMilestone}
              onDeleteMilestone={handleDeleteMilestone}
              onToggleMilestone={(_goalId, milestoneId) => handleToggleMilestone(milestoneId)}
              projects={projects}
              onOpenProject={(projectId) => {
                setSelectedProjectId(projectId);
                navigateToView("Projects");
              }}
              onAddProject={handleAddProject}
            />
          </div>

          <div
            style={{
              display: view === "Projects" ? "flex" : "none",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
            }}
          >
            <Projects
              projects={projects}
              goals={goals}
              milestones={milestones}
              tasks={tasks}
              selectedProjectId={selectedProjectId}
              onSelectProject={setSelectedProjectId}
              onAddProject={handleAddProject}
              onEditProject={(projectId, data) => {
                const existing = projects.find((project) => project.id === projectId);
                if (!existing) return;
                const updatedProject = alignProject(updateProject(existing, data), goals);
                setProjects((current) => current.map((project) =>
                  project.id === projectId ? updatedProject : project,
                ));
                // Keep child relationships consistent immediately when the
                // Project's Goal changes; never wait for a reload.
                if (updatedProject.goalId !== existing.goalId) {
                  const propagated = propagateProjectGoalChange(milestones, tasks, updatedProject);
                  setMilestones(propagated.milestones);
                  setTasks(propagated.tasks);
                }
              }}
              onEditProjectStatus={(projectId, status) =>
                setProjects((current) => current.map((project) =>
                  project.id === projectId ? updateProjectStatus(project, status) : project,
                ))
              }
              onDeleteProject={(projectId) => {
                const project = projects.find((item) => item.id === projectId);
                if (!project) return;
                // Milestones and Tasks are detached (kept), never deleted with the Project.
                setMilestones((current) => detachMilestonesFromDeletedProject(current, project));
                setTasks((current) => detachTasksFromDeletedProject(current, project, milestones));
                setFocusSessions((current) => disassociateProjectFocusSessions(
                  current,
                  projectId,
                  new Set<string>(),
                  new Set<string>(),
                ));
                setProjects((current) => deleteProject(current, projectId));
                setSelectedProjectId((current) => (current === projectId ? null : current));
              }}
              onAddMilestone={handleAddMilestone}
              onEditMilestone={handleEditMilestone}
              onDeleteMilestone={handleDeleteMilestone}
              onToggleMilestone={handleToggleMilestone}
              onAddTask={handleAddTask}
              onEditTask={handleEditTask}
              onDeleteTask={handleDeleteTask}
              onToggleTask={handleToggleTask}
            />
          </div>

          <div
            style={{
              display: view === "Settings" ? "flex" : "none",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
            }}
          >
            <div style={styles.settingsPage}>
              <h1 style={styles.h1}>Settings</h1>
              <p style={styles.subtitle}>Customize your Synchron experience.</p>

              {/* General Section */}
              <section style={styles.settingsSection} aria-labelledby="general-section-title">
                <h2 id="general-section-title" style={styles.settingsSectionHeader}>
                  <CalendarDays size={20} />
                  General
                </h2>
                <div style={styles.settingsCard}>
                  <div style={styles.settingsRow}>
                    <div>
                      <span style={styles.settingsLabel}>Appearance</span>
                      <span style={styles.settingsDescription}>Choose your preferred color theme.</span>
                    </div>
                    <div className="settings-segment" style={styles.settingsSegment} role="group" aria-label="Appearance Theme">
                      {(["light", "dark"] as Theme[]).map((theme) => (
                        <button
                          key={theme}
                          type="button"
                          className="settings-segment-button"
                          onClick={() => setAppSettings((current) => ({ ...current, theme }))}
                          aria-pressed={appSettings.theme === theme}
                        >
                          {theme === "dark" ? "Dark" : "Light"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={styles.settingsRow}>
                    <div>
                      <span style={styles.settingsLabel}>Default View Mode</span>
                      <span style={styles.settingsDescription}>Choose how habits are displayed by default.</span>
                    </div>
                    <div
                      className="settings-segment"
                      style={{ ...styles.settingsSegment, ...styles.settingsViewSegment }}
                      role="group"
                      aria-label="Default View Mode"
                    >
                      {(["grid", "list"] as const).map((viewMode) => (
                        <button
                          key={viewMode}
                          type="button"
                          className="settings-segment-button settings-view-button"
                          onClick={() => changeHabitViewMode(viewMode)}
                          aria-pressed={appSettings.viewMode === viewMode}
                          aria-label={`${viewMode === "grid" ? "Grid" : "List"} view`}
                          title={`${viewMode === "grid" ? "Grid" : "List"} view`}
                        >
                          {viewMode === "grid" ? <Grid2X2 size={17} aria-hidden="true" /> : <List size={17} aria-hidden="true" />}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={styles.settingsRow}>
                    <div>
                      <label htmlFor="day-reset-time" style={styles.settingsLabel}>Day Reset Time</label>
                      <span style={styles.settingsDescription}>Choose when a new habit day begins.</span>
                    </div>
                    <select
                      className="ui-select"
                      id="day-reset-time"
                      style={styles.settingsSelect}
                      value={appSettings.dayResetHour}
                      onChange={(event) => {
                        const dayResetHour = Number(event.target.value);
                        setAppSettings((current) => ({ ...current, dayResetHour }));
                        setSelectedDateKey(getTodayKey(dayResetHour));
                      }}
                    >
                      <option value={0}>12:00 AM</option>
                      <option value={1}>1:00 AM</option>
                      <option value={2}>2:00 AM</option>
                      <option value={3}>3:00 AM</option>
                    </select>
                  </div>
                  <div style={styles.settingsRow}>
                    <div>
                      <span style={styles.settingsLabel}>Start of Week</span>
                      <span style={styles.settingsDescription}>Used by calendar grids and weekly summaries.</span>
                    </div>
                    <div style={styles.settingsSegment} role="group" aria-label="Start of Week">
                      {(["Sunday", "Monday"] as WeekStart[]).map((weekStart) => (
                        <button
                          key={weekStart}
                          type="button"
                          className="settings-segment-button"
                          onClick={() => setAppSettings((current) => ({ ...current, weekStart }))}
                          aria-pressed={appSettings.weekStart === weekStart}
                        >
                          {weekStart}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* Today & Habits Section */}
              <section style={styles.settingsSection} aria-labelledby="today-habits-section-title">
                <h2 id="today-habits-section-title" style={styles.settingsSectionHeader}>
                  <ListChecks size={20} />
                  Today &amp; Habits
                </h2>
                <div style={styles.settingsCard}>
                  <div style={styles.settingsRow}>
                    <div>
                      <span style={styles.settingsLabel}>Show Mandatory Habits in Important Items</span>
                      <span style={styles.settingsDescription}>Include pending mandatory habits in today&apos;s important items.</span>
                    </div>
                    <SettingsSwitch
                      label="Show Mandatory Habits in Important Items"
                      checked={appSettings.showMandatoryHabitsInImportantItems ?? false}
                      onChange={() => setAppSettings((current) => ({
                        ...current,
                        showMandatoryHabitsInImportantItems: !(current.showMandatoryHabitsInImportantItems ?? false),
                      }))}
                    />
                  </div>
                </div>
              </section>

              {/* Focus & Timer Section */}
              <section style={styles.settingsSection} aria-labelledby="focus-timer-section-title">
                <h2 id="focus-timer-section-title" style={styles.settingsSectionHeader}>
                  <Clock3 size={20} />
                  Focus &amp; Timer
                </h2>
                <div style={styles.settingsCard}>
                  <div style={styles.settingsRow}>
                    <div>
                      <span style={styles.settingsLabel}>Default Focus Duration</span>
                      <span style={styles.settingsDescription}>Applied to the Timer and Pomodoro focus duration.</span>
                    </div>
                    <div style={styles.settingsSegment} role="group" aria-label="Default Focus Duration">
                      {FOCUS_DURATION_PRESETS.map((minutes) => (
                        <button
                          key={minutes}
                          type="button"
                          className="settings-segment-button"
                          onClick={() => setAppSettings((current) => ({ ...current, defaultFocusDuration: minutes }))}
                          aria-pressed={appSettings.defaultFocusDuration === minutes}
                        >
                          {minutes}m
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={styles.settingsRow}>
                    <div>
                      <span style={styles.settingsLabel}>Quick Adjust Step</span>
                      <span style={styles.settingsDescription}>Choose the time added or removed by the timer controls.</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <select
                        className="ui-select"
                        style={{ ...styles.settingsSelect, minWidth: 120 }}
                        value={[1, 5, 10].includes(appSettings.quickAdjustStepMinutes) ? appSettings.quickAdjustStepMinutes : "custom"}
                        onChange={(event) => {
                          if (event.target.value !== "custom") {
                            setAppSettings((current) => ({ ...current, quickAdjustStepMinutes: Number(event.target.value) }));
                          } else if ([1, 5, 10].includes(appSettings.quickAdjustStepMinutes)) {
                            setAppSettings((current) => ({ ...current, quickAdjustStepMinutes: 2 }));
                          }
                        }}
                        aria-label="Quick Adjust Step Size"
                      >
                        <option value={1}>1 Minute</option>
                        <option value={5}>5 Minutes</option>
                        <option value={10}>10 Minutes</option>
                        <option value="custom">Custom</option>
                      </select>
                      {!([1, 5, 10].includes(appSettings.quickAdjustStepMinutes)) && (
                        <input
                          className="ui-input ui-numeric"
                          type="number"
                          min={1}
                          max={180}
                          style={{ ...styles.settingsSelect, minWidth: 76, width: 76 }}
                          value={appSettings.quickAdjustStepMinutes}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            if (Number.isFinite(value) && value >= 1) {
                              setAppSettings((current) => ({
                                ...current,
                                quickAdjustStepMinutes: Math.min(180, Math.round(value)),
                              }));
                            }
                          }}
                          aria-label="Custom Quick Adjust Step in Minutes"
                        />
                      )}
                      {!([1, 5, 10].includes(appSettings.quickAdjustStepMinutes)) && (
                        <span style={styles.durationLabel}>Minutes</span>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* Notifications Section */}
              <section style={styles.settingsSection} aria-labelledby="notifications-section-title">
                <h2 id="notifications-section-title" style={styles.settingsSectionHeader}>
                  <Bell size={20} />
                  Notifications
                </h2>
                <div style={styles.settingsCard}>
                  <div style={styles.settingsRow}>
                    <div>
                      <span style={styles.settingsLabel}>Enable Intelligent Notifications</span>
                      <span style={styles.settingsDescription}>Allow Synchron to send useful reminders based on your activity.</span>
                    </div>
                    <SettingsSwitch
                      label="Enable Intelligent Notifications"
                      checked={appSettings.enableIntelligentNotifications}
                      onChange={() => setAppSettings((current) => ({
                        ...current,
                        enableIntelligentNotifications: !current.enableIntelligentNotifications,
                      }))}
                    />
                  </div>
                  <div style={styles.settingsRow}>
                    <div>
                      <label htmlFor="notification-frequency" style={styles.settingsLabel}>Notification Frequency</label>
                      <span style={styles.settingsDescription}>Minimum time between proactive notifications.</span>
                    </div>
                    <select
                      className="ui-select"
                      id="notification-frequency"
                      style={styles.settingsSelect}
                      value={appSettings.notificationFrequency}
                      onChange={(event) => setAppSettings((current) => ({
                        ...current,
                        notificationFrequency: event.target.value as NotificationFrequency,
                      }))}
                    >
                      <option value="conservative">Conservative</option>
                      <option value="balanced">Balanced</option>
                      <option value="frequent">Frequent</option>
                    </select>
                  </div>
                  <div>
                    <h3 style={styles.settingsSubheading}>Allow Intelligent Notifications For:</h3>
                  </div>
                  {([
                    ["habitReminders", "Habit Timing Reminders"],
                    ["incompleteHabitReminders", "Incomplete Habit Focus Suggestions"],
                  ] as const).map(([setting, label]) => {
                    const enabled = appSettings[setting];
                    return (
                      <div key={setting} style={styles.settingsRowCompact}>
                        <span style={{ ...styles.settingsLabel, opacity: appSettings.enableIntelligentNotifications ? 1 : 0.5 }}>{label}</span>
                        <SettingsSwitch
                          label={label}
                          checked={enabled}
                          disabled={!appSettings.enableIntelligentNotifications}
                          onChange={() => setAppSettings((current) => ({ ...current, [setting]: !current[setting] }))}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Sound Section */}
              <section style={styles.settingsSection} aria-labelledby="sound-section-title">
                <h2 id="sound-section-title" style={styles.settingsSectionHeader}>
                  <Volume2 size={20} />
                  Sound
                </h2>
                <div style={styles.settingsCard}>
                  <div style={styles.settingsRow}>
                    <div>
                      <span style={styles.settingsLabel}>Sound Effects</span>
                      <span style={styles.settingsDescription}>Play subtle sounds for timers, habits, and other actions.</span>
                    </div>
                    <SettingsSwitch
                      label="Play subtle sounds for timers, habits, and other actions"
                      checked={appSettings.soundAlerts}
                      onChange={() => setAppSettings((current) => ({ ...current, soundAlerts: !current.soundAlerts }))}
                    />
                  </div>
                  <div style={styles.settingsRow}>
                    <div>
                      <label htmlFor="sfx-volume" style={styles.settingsLabel}>Master Volume</label>
                      <span style={styles.settingsDescription}>Adjust the overall volume of sound effects.</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 150 }}>
                      <input
                        className="ui-range"
                        type="range"
                        id="sfx-volume"
                        min={0}
                        max={100}
                        step={5}
                        value={appSettings.sfxVolume}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          setAppSettings((current) => ({ ...current, sfxVolume: value }));
                        }}
                        disabled={!appSettings.soundAlerts}
                        aria-label="Master SFX Volume"
                        style={{ flex: 1 }}
                      />
                      <span style={{ ...styles.settingsLabel, minWidth: 40, textAlign: "right" }}>
                        {appSettings.sfxVolume}%
                      </span>
                    </div>
                  </div>
                  <div>
                    <h3 style={styles.settingsSubheading}>Individual Sounds</h3>
                  </div>
                  {([
                    ["start", "Timer Start"],
                    ["pauseResume", "Pause/Resume"],
                    ["habitComplete", "Habit Complete"],
                    ["pomodoroTransition", "Pomodoro Transition"],
                    ["timerComplete", "Timer Complete"],
                  ] as const).map(([sfxKey, label]) => {
                    const enabled = appSettings.sfxEnabled[sfxKey];
                    return (
                      <div key={sfxKey} style={styles.settingsRowCompact}>
                        <span style={{ ...styles.settingsLabel, opacity: appSettings.soundAlerts ? 1 : 0.5 }}>{label}</span>
                        <SettingsSwitch
                          label={label}
                          checked={enabled}
                          disabled={!appSettings.soundAlerts}
                          onChange={() => setAppSettings((current) => ({
                            ...current,
                            sfxEnabled: {
                              ...current.sfxEnabled,
                              [sfxKey]: !current.sfxEnabled[sfxKey],
                            },
                          }))}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Keyboard Shortcuts Section */}
              <section style={styles.settingsSection} aria-labelledby="shortcuts-section-title">
                <h2 id="shortcuts-section-title" style={styles.settingsSectionHeader}>
                  <Keyboard size={20} />
                  Keyboard Shortcuts
                </h2>
                <div className="shortcuts-grid" style={styles.shortcutsGrid}>
                  {[
                    {
                      title: "Navigation",
                      shortcuts: [
                        { keys: `${shortcutKey}1`, description: "Go to Today" },
                        { keys: `${shortcutKey}2`, description: "Go to My Habits" },
                        { keys: `${shortcutKey}3`, description: "Go to Tasks" },
                        { keys: `${shortcutKey}4`, description: "Go to Timer" },
                        { keys: `${shortcutKey}5`, description: "Go to Goals" },
                        { keys: `${shortcutKey}6`, description: "Go to History" },
                        { keys: `${shortcutKey}7`, description: "Go to Analytics" },
                        { keys: `${shortcutKey},`, description: "Go to Settings" },
                        { keys: `${shortcutKey}K`, description: "Open Command Palette" },
                        { keys: `${shortcutKey}/`, description: "Show Keyboard Shortcuts" },
                      ],
                    },
                    {
                      title: "My Habits",
                      shortcuts: [
                        { keys: "G", description: "Switch to Grid View" },
                        { keys: "L", description: "Switch to List View" },
                        { keys: "N", description: "Focus New Habit" },
                        { keys: "E", description: "Edit the focused Habit" },
                      ],
                    },
                    {
                      title: "Timer",
                      shortcuts: [
                        { keys: "Space", description: "Start or pause the timer" },
                      ],
                    },
                    {
                      title: "General",
                      shortcuts: [
                        { keys: "Esc", description: "Close a modal, editor, or popover" },
                        { keys: `${shortcutKey} Enter`, description: "Save the active Habit edit" },
                      ],
                    },
                  ].map((group, groupIndex) => (
                    <div key={groupIndex} style={styles.shortcutsGroup}>
                      <h3 style={styles.shortcutsGroupTitle}>{group.title}</h3>
                      {group.shortcuts.map((shortcut, shortcutIndex) => (
                        <div
                          key={shortcutIndex}
                          style={{
                            ...styles.shortcutItem,
                            ...(shortcutIndex === group.shortcuts.length - 1 ? styles.shortcutItemLast : {}),
                          }}
                        >
                          <span style={styles.shortcutDescription}>{shortcut.description}</span>
                          <div style={styles.shortcutKeys}>
                            {shortcut.keys.split(" ").map((key, keyIndex) => (
                              <span key={keyIndex} style={styles.shortcutKey}>
                                {key}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </section>

              {/* About Section */}
              <section style={styles.settingsSection} aria-labelledby="about-section-title">
                <h2 id="about-section-title" style={styles.settingsSectionHeader}>
                  <Info size={20} />
                  About
                </h2>
                <div style={styles.settingsCard}>
                  <div style={styles.settingsAboutRow}>
                    <div>
                      <span style={styles.settingsAppName}>Synchron</span>
                      <span style={styles.settingsVersion}>
                        {appVersion ? `v${appVersion}` : "Version unavailable"}
                      </span>
                    </div>
                  </div>
                  <div style={styles.settingsRow}>
                    <div>
                      <span style={styles.settingsLabel}>Replay Introduction</span>
                      <span style={styles.settingsDescription}>Start the onboarding flow again to see the introduction.</span>
                    </div>
                    <button
                      type="button"
                      style={styles.settingsActionButton}
                      onClick={() => {
                        setAppSettings((current) => ({ ...current, onboardingCompleted: false }));
                        setShowOnboarding(true);
                      }}
                    >
                      <RotateCcw size={15} />
                      Restart
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>

        </main>
      </div>
      {categoryPendingDeletion && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setCategoryPendingDeletion(null)}
        >
          <div
            className="delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-category-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="delete-category-modal-title">Delete "{categoryPendingDeletion}"?</h2>
            <p>Habits in this category will become No Category.</p>
            <div className="delete-modal-actions">
              <button
                type="button"
                className="delete-modal-cancel"
                onClick={() => setCategoryPendingDeletion(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="delete-modal-confirm"
                onClick={confirmCategoryDeletion}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {habitPendingDeletion && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setHabitPendingDeletion(null)}
        >
          <div
            className="delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="delete-modal-title">Delete "{habitPendingDeletion.name}"?</h2>
            <p>This action cannot be undone.</p>
            <div className="delete-modal-actions">
              <button
                type="button"
                className="delete-modal-cancel"
                onClick={() => setHabitPendingDeletion(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="delete-modal-confirm"
                onClick={confirmHabitDeletion}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {focusSessionPendingDeletion && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setFocusSessionPendingDeletion(null)}
        >
          <div
            className="delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-focus-session-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="delete-focus-session-modal-title">
              Delete this "{focusSessionPendingDeletion.sessionType}" session?
            </h2>
            <p>This action cannot be undone.</p>
            <div className="delete-modal-actions">
              <button
                type="button"
                className="delete-modal-cancel"
                onClick={() => setFocusSessionPendingDeletion(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="delete-modal-confirm"
                onClick={confirmFocusSessionDeletion}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showKeyboardShortcuts && (
        <KeyboardShortcutsModal onClose={() => setShowKeyboardShortcuts(false)} shortcutKey={shortcutKey} />
      )}

      {paletteOpen && (
        <CommandPalette
          commands={paletteCommands}
          shortcutKey={shortcutKey}
          onRunCommand={runPaletteCommand}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      {showOnboarding && (
        <Onboarding
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
          onNavigateToToday={handleOnboardingNavigateToToday}
        />
      )}
    </div>
  );
}

export default App;