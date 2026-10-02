import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
  ListChecks,
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
  Flame,
  Settings,
  Target,
  Clock3,
  CalendarDays,
  Keyboard,
  Filter,
  Bell,
  Grid2X2,
  List,
} from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
// Lines 18–22 in App.tsx
import FocusTimer from "./components/FocusTimer";
import History from "./components/History";
import Analytics from "./components/Analytics";
import Today from "./components/Today";
import Goals from "./components/Goals";
import Programs from "./components/Programs";
import StreakBadge from "./components/StreakBadge";
import KeyboardShortcutsModal from "./components/KeyboardShortcutsModal";
import { CARD_SURFACE } from "./theme";
import "./styles/AppLayout.css";
import type {
  Priority,
  HabitType,
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
  Summary,
  FocusSessionRecord,
  Program as ProgramEntity,
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
  loadPrograms,
  savePrograms,
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
import { createTask, toggleTaskCompletion, updateTask, deleteTask } from "./domain/tasks";
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
  getIntelligentNotification,
  sendIntelligentNotification,
} from "./domain/notificationLogic";
import { groupHabitsIntoPrograms, type ProgramView } from "./domain/programLogic";
import {
  countCompletedInWindow,
  getChallengeDayNumber,
  getChallengeMetadata,
  isChallengeActiveOnDate,
} from "./domain/programHabits";

const DEFAULT_DURATION = 30;
const DEFAULT_SETTINGS: AppSettings = {
  viewMode: "grid",
  dayResetHour: 0,
  weekStart: "Sunday",
  defaultFocusDuration: 25,
  quickAdjustStepMinutes: 5,
  soundAlerts: true,
  showMandatoryHabitsInImportantItems: false,
  enableIntelligentNotifications: true,
  notificationFrequency: "balanced",
  habitReminders: true,
  incompleteHabitReminders: true,
  theme: "dark",
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
    padding: "10px 12px",
    color: "var(--text-body)",
    fontSize: 14,
    outline: "none",
    cursor: "pointer",
  },
  habitPropertySelect: {
    background: "var(--bg-surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    padding: "10px 12px",
    color: "var(--text-body)",
    fontSize: 14,
    outline: "none",
    cursor: "pointer",
    flex: "1 1 140px",
    minWidth: 140,
    height: 40,
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
    padding: "10px 10px",
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
  challengeBadge: {
    ...typeBadgeBase,
    color: "var(--color-accent)",
    background: "var(--accent-wash-soft)",
    border: "1px solid var(--accent-border-soft)",
  },
  challengeBadgeCompleted: {
    color: "var(--text-dim)",
    background: "transparent",
    border: "1px solid var(--border-strong)",
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
    borderRadius: 6,
    padding: "6px 10px",
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
    borderRadius: 6,
    padding: "6px 10px",
    color: "var(--text-body)",
    fontSize: 14,
    outline: "none",
    cursor: "pointer",
  },
  editDurationInput: {
    width: 56,
    background: "var(--bg-inset)",
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
    padding: "6px 8px",
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
    padding: "10px 12px",
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
    maxWidth: 760,
    width: "100%",
  },
  settingsCard: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-4)",
    marginBottom: "var(--space-3)",
    padding: "var(--space-5)",
    border: "none",
    borderBottom: "1px solid var(--border-color)",
    borderRadius: 0,
    background: "transparent",
  },
  settingsCardTitle: {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-2)",
    margin: 0,
    color: "var(--text-primary)",
    fontSize: "var(--type-base)",
    fontWeight: "var(--font-semibold)",
  },
  settingsRow: {
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
    margin: "8px 0 0",
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
    minWidth: 190,
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
  };
}

function formatCompletedDays(count: number): string {
  return `${count} ${count === 1 ? "Day" : "Days"} Completed`;
}

function computeSummary(habits: Habit[], dateKey: string): Summary {
  const total = habits.length;
  const doneCount = habits.filter((h) => h.completedDates.includes(dateKey))
    .length;
  const mandatoryHabits = habits.filter((h) => h.priority === "Mandatory");
  const mandatoryTotal = mandatoryHabits.length;
  const mandatoryDone = mandatoryHabits.filter((h) =>
    h.completedDates.includes(dateKey),
  ).length;
  const percent = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  return { total, doneCount, percent, mandatoryTotal, mandatoryDone };
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
      const parsed = loadStorageData<(Partial<Habit> & { id: number; name: string })[]>(STORAGE_KEYS.HABITS, []);
      if (!Array.isArray(parsed)) return [];

      return parsed.map((item) => {
        const hasValidChallengeFields =
          item.type === "Challenge" &&
          typeof item.startDate === "string" &&
          typeof item.durationDays === "number" &&
          item.durationDays > 0;

        const category =
          typeof item.category === "string" ? normalizeCategory(item.category) : "";

        return {
          id: item.id,
          name: item.name,
          createdAt: typeof item.createdAt === "string" ? item.createdAt : undefined,
          goalId: typeof item.goalId === "string" ? item.goalId : undefined,
          priority: item.priority === "Mandatory" ? "Mandatory" : "Optional",
          type: item.type === "Challenge" ? "Challenge" : "Daily",
          frequencyType:
            item.frequencyType === "weekdays" ||
            item.frequencyType === "weekends" ||
            item.frequencyType === "custom"
              ? item.frequencyType
              : "daily",
          customDays: Array.isArray(item.customDays)
            ? item.customDays.filter((day): day is string => WEEKDAYS.includes(day))
            : [],
          durationDays: hasValidChallengeFields ? item.durationDays : undefined,
          startDate: hasValidChallengeFields ? item.startDate : undefined,
          completedDates: Array.isArray(item.completedDates)
            ? item.completedDates
            : [],
          isArchived: item.isArchived === true,
          category: category || undefined,
          scheduledTime: typeof item.scheduledTime === "string" ? item.scheduledTime : undefined,
          durationMinutes: typeof item.durationMinutes === "number" && item.durationMinutes > 0 ? item.durationMinutes : undefined,
          programId: typeof item.programId === "number" ? item.programId : undefined,
        };
      });
    };
    return localLoadHabits();
  });
  const [programs, setPrograms] = useState<ProgramEntity[]>(loadPrograms);
  const programViews = groupHabitsIntoPrograms(programs, habits, appSettings.dayResetHour);
  const activePrograms = programViews.filter(
    (program) => program.state === "Active" && program.habits.some((habit) => !habit.isArchived),
  );
  const [goals, setGoals] = useState<Goal[]>(loadGoals);
  const [tasks, setTasks] = useState<Task[]>(loadTasks);
  const [milestones, setMilestones] = useState<Milestone[]>(loadMilestones);
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
  const [newType, setNewType] = useState<HabitType>("Daily");
  const [newProgramId, setNewProgramId] = useState("");
  const [newFrequencyType, setNewFrequencyType] = useState<FrequencyType>("daily");
  const [newCustomDays, setNewCustomDays] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingGoalId, setEditingGoalId] = useState("");
  const [editingPriority, setEditingPriority] = useState<Priority>("Optional");
  const [editingType, setEditingType] = useState<HabitType>("Daily");
  const [editingProgramId, setEditingProgramId] = useState("");
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
  const registerTimerShortcut = useCallback((handler: (() => boolean) | null) => {
    timerShortcutRef.current = handler;
  }, []);
  const [editingCustomCategory, setEditingCustomCategory] = useState<string | null>(null);
  const [customCategoryDraft, setCustomCategoryDraft] = useState("");
  const [categoryPendingDeletion, setCategoryPendingDeletion] = useState<string | null>(null);
  const [programPendingDeletion, setProgramPendingDeletion] = useState<ProgramView | null>(null);
  const [habitPendingDeletion, setHabitPendingDeletion] = useState<Habit | null>(null);
  const [focusSessionPendingDeletion, setFocusSessionPendingDeletion] = useState<FocusSessionRecord | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Filter state
  const [filterType, setFilterType] = useState<"All" | "Daily" | "Program Habits">("All");
  const [filterPriority, setFilterPriority] = useState<"All" | "Mandatory" | "Optional">("All");
  const [filterFrequency, setFilterFrequency] = useState<"All" | "daily" | "weekdays" | "weekends">("All");
  const [filterStatus, setFilterStatus] = useState<"All" | "Active" | "Archived" | "Completed Today" | "Incomplete Today">("All");

  // Program creation state
  const [showProgramModal, setShowProgramModal] = useState(false);
  const [programEditingId, setProgramEditingId] = useState<number | null>(null);
  const [programName, setProgramName] = useState("");
  const [programStartDate, setProgramStartDate] = useState(getTodayKey(0));
  const [programDuration, setProgramDuration] = useState(String(DEFAULT_DURATION));
  const [programHabits, setProgramHabits] = useState<Array<{ name: string; priority: Priority }>>([]);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
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

  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", appSettings.theme);
  }, [appSettings.theme]);

  useEffect(() => {
    saveHabits(habits);
  }, [habits]);

  useEffect(() => {
    savePrograms(programs);
  }, [programs]);

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

  useEffect(() => {
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
    };
  }, [habits, appSettings]);

  useEffect(() => {
    const handleNotificationAction = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string; habitId?: number; habitName?: string; title?: string; durationMinutes?: number }>).detail;
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

    window.addEventListener("habit-tracker:notification-action", handleNotificationAction as EventListener);
    return () => {
      window.removeEventListener("habit-tracker:notification-action", handleNotificationAction as EventListener);
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
      shortcutsBlocked: showKeyboardShortcuts || showProgramModal ||
        focusSessionPendingDeletion !== null || habitPendingDeletion !== null ||
        categoryPendingDeletion !== null || programPendingDeletion !== null,
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
        if (focusSessionPendingDeletion) {
          setFocusSessionPendingDeletion(null);
        } else if (habitPendingDeletion) {
          setHabitPendingDeletion(null);
        } else if (categoryPendingDeletion) {
          setCategoryPendingDeletion(null);
        } else if (programPendingDeletion) {
          setProgramPendingDeletion(null);
        } else if (showProgramModal) {
          closeProgramModal();
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
          "3": "Timer",
          "4": "Programs",
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
    if (filterType !== "All") {
      if (filterType === "Daily" && habit.type !== "Daily") return false;
      if (filterType === "Program Habits" && habit.type !== "Challenge") return false;
    }

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
    filterType !== "All",
    filterPriority !== "All",
    filterFrequency !== "All",
    filterStatus !== "All",
  ].filter(Boolean).length;

  // Clear all property filters
  const clearPropertyFilters = () => {
    setFilterType("All");
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
    const linkedProgram = activePrograms.find((program) => program.id === Number(newProgramId));

    if (name === "" || (newType === "Challenge" && !linkedProgram)) {
      return;
    }

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
      type: newType,
      frequencyType: newFrequencyType,
      customDays: newFrequencyType === "custom" ? newCustomDays : [],
      ...(linkedProgram
        ? {
            programId: linkedProgram.id,
          }
        : {}),
      completedDates: [],
    };

    setHabits([...habits, habit]);
    if (linkedProgram) {
      setPrograms((current) => current.map((program) => program.id === linkedProgram.id
        ? { ...program, habitIds: [...program.habitIds, habit.id] }
        : program));
    }
    setNewHabit("");
    setNewGoalId("");
    setNewPriority("Optional");
    setNewType("Daily");
    setNewProgramId("");
    setNewFrequencyType("daily");
    setNewCustomDays([]);
    setNewCategory("");
    setNewCategoryName("");
  }

  function toggleHabit(id: number, dateKey?: string) {
    const targetDateKey = dateKey ?? selectedDateKey;
    const updatedHabits: Habit[] = habits.map((habit): Habit => {
      if (habit.id !== id) return habit;

      const isDoneOnTargetDate = habit.completedDates.includes(targetDateKey);
      const completedDates = isDoneOnTargetDate
        ? habit.completedDates.filter((date) => date !== targetDateKey)
        : [...habit.completedDates, targetDateKey];

      return { ...habit, completedDates };
    });
    setHabits(updatedHabits);
  }

  function requestHabitDeletion(habit: Habit) {
    setHabitPendingDeletion(habit);
  }

  function confirmHabitDeletion() {
    if (!habitPendingDeletion) return;

    setPrograms((current) => current.map((program) => ({
      ...program,
      habitIds: program.habitIds.filter((habitId) => habitId !== habitPendingDeletion.id),
    })));
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
    setEditingType(habit.type);
    setEditingProgramId(habit.programId ? String(habit.programId) : "");
    setEditingFrequencyType(getFrequencyType(habit));
    setEditingCustomDays(habit.customDays ?? []);
    setEditingCategory(habit.category ?? "");
    setEditingCategoryName("");
  }

  function startProgramHabitEdit(habit: Habit) {
    setSelectedDateKey(getTodayKey(appSettings.dayResetHour));
    setActiveCategory(ALL_CATEGORIES);
    setFilterType("All");
    setFilterPriority("All");
    setFilterFrequency("All");
    setFilterStatus("All");
    setShowArchived(habit.isArchived === true);
    setView("Habits");
    startEdit(habit);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
    setEditingGoalId("");
    setEditingPriority("Optional");
    setEditingType("Daily");
    setEditingProgramId("");
    setEditingFrequencyType("daily");
    setEditingCustomDays([]);
    setEditingCategory("");
    setEditingCategoryName("");
  }

  function saveEdit(id: number) {
    const name = editingName.trim();
    const existingHabit = habits.find((habit) => habit.id === id);
    const retainsProgram = editingType === "Challenge" && existingHabit?.programId === Number(editingProgramId);
    const linkedProgram = activePrograms.find((program) => program.id === Number(editingProgramId));

    if (name === "" || (editingType === "Challenge" && !retainsProgram && !linkedProgram)) {
      return;
    }
    const nextProgramId = editingType === "Challenge"
      ? (retainsProgram ? existingHabit?.programId : linkedProgram?.id)
      : undefined;

    const category = normalizeCategory(
      editingCategory === ADD_CATEGORY_VALUE
        ? editingCategoryName
        : editingCategory,
    );
    rememberCategory(category);

    const updatedHabits: Habit[] = habits.map((habit): Habit => {
        if (habit.id !== id) return habit;

        if (editingType === "Daily") {
          return {
            ...habit,
            name,
            goalId: editingGoalId || undefined,
            priority: editingPriority,
            type: "Daily",
            frequencyType: editingFrequencyType,
            customDays: editingFrequencyType === "custom" ? editingCustomDays : [],
            durationDays: undefined,
            startDate: undefined,
            programId: undefined,
            category,
          };
        }

        return {
          ...habit,
          name,
          goalId: editingGoalId || undefined,
          priority: editingPriority,
          type: "Challenge",
          frequencyType: editingFrequencyType,
          customDays: editingFrequencyType === "custom" ? editingCustomDays : [],
          programId: nextProgramId,
          category,
        };
      });
    const previousProgramId = existingHabit?.programId;
    if (previousProgramId !== nextProgramId) {
      setPrograms((current) => current.map((program) => {
        const withoutHabit = program.habitIds.filter((habitId) => habitId !== id);
        return {
          ...program,
          habitIds: program.id === nextProgramId ? [...withoutHabit, id] : withoutHabit,
        };
      }));
    }
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
    const newRecord: FocusSessionRecord = {
      id: Date.now(),
      timestamp: Date.now(),
      sessionType,
      durationMinutes,
      habitName,
      habitId,
      goalId,
      milestoneId,
      taskId,
    };
    setFocusSessions((prev) => [...prev, newRecord]);
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

  function closeProgramModal() {
    setShowProgramModal(false);
    setProgramEditingId(null);
    setProgramName("");
    setProgramStartDate(getTodayKey(appSettings.dayResetHour));
    setProgramDuration(String(DEFAULT_DURATION));
    setProgramHabits([]);
  }

  function startProgramEdit(program: ProgramView) {
    setProgramEditingId(program.id);
    setProgramName(program.name);
    setProgramStartDate(program.startDate);
    setProgramDuration(String(program.durationDays));
    setProgramHabits([]);
    setShowProgramModal(true);
  }

  function createProgram() {
    const name = programName.trim();
    if (name === "") return;

    const duration = Math.max(1, Math.round(Number(programDuration)) || DEFAULT_DURATION);

    if (programEditingId !== null) {
      setPrograms((current) => current.map((program) => program.id === programEditingId
        ? { ...program, name, durationDays: duration, startDate: programStartDate }
        : program));
      closeProgramModal();
      return;
    }

    if (programHabits.length === 0) return;
    const programId = Date.now();

    const newHabits: Habit[] = programHabits.map((habitData, index) => ({
      id: Date.now() + index,
      name: habitData.name,
      createdAt: getTodayKey(appSettings.dayResetHour),
      priority: habitData.priority,
      type: "Challenge" as HabitType,
      frequencyType: "daily" as FrequencyType,
      customDays: [],
      completedDates: [],
      programId,
    }));

    const newProgram: ProgramEntity = {
      id: programId,
      name,
      startDate: programStartDate,
      durationDays: duration,
      habitIds: newHabits.map((habit) => habit.id),
    };
    setPrograms((current) => [...current, newProgram]);
    setHabits([...habits, ...newHabits]);
    closeProgramModal();
    setView("Programs");
  }

  function toggleProgramArchive(programId: number) {
    setHabits((current) => {
      const members = current.filter((habit) => habit.programId === programId);
      if (members.length === 0) return current;
      const shouldArchive = !members.every((habit) => habit.isArchived);
      return current.map((habit) => habit.programId === programId
        ? { ...habit, isArchived: shouldArchive }
        : habit);
    });
  }

  function requestProgramDeletion(program: ProgramView) {
    setProgramPendingDeletion(program);
  }

  function confirmProgramDeletion() {
    if (!programPendingDeletion) return;
    const programId = programPendingDeletion.id;
    setPrograms((current) => current.filter((program) => program.id !== programId));
    setHabits((current) => current.filter((habit) => habit.programId !== programId));
    setProgramPendingDeletion(null);
  }

  function addProgramHabit() {
    const habitName = newHabit.trim();
    if (habitName === "") return;

    setProgramHabits([...programHabits, { name: habitName, priority: newPriority }]);
    setNewHabit("");
    setNewPriority("Optional");
  }

  function removeProgramHabit(index: number) {
    setProgramHabits(programHabits.filter((_, i) => i !== index));
  }

  const availableHabits = habits.filter(
    (habit) =>
      !habit.isArchived &&
      matchesCategory(habit) &&
      applyPropertyFilters(habit) &&
      (habit.type === "Daily" || isChallengeActiveOnDate(habit, selectedDateKey, programs)),
  );
  const archivedHabits = habits.filter(
    (habit) => habit.isArchived && matchesCategory(habit) && applyPropertyFilters(habit),
  );
  const activeHabits = availableHabits.filter((habit) =>
    isHabitScheduledOnDate(habit, selectedDateKey),
  );
  const offDayHabits = availableHabits.filter(
    (habit) => !isHabitScheduledOnDate(habit, selectedDateKey),
  );
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
          <div style={styles.frequencyDays} aria-label="Custom frequency days">
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
            placeholder="New category name"
            aria-label="New category name"
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
              <select
                style={styles.editSelect}
                value={editingType}
                onChange={(event) => {
                  const type = event.target.value as HabitType;
                  setEditingType(type);
                  if (type === "Daily") setEditingProgramId("");
                }}
                aria-label="Type"
              >
                <option value="Daily">Daily Habit</option>
                <option value="Challenge">Program</option>
              </select>
              {editingType === "Challenge" && (
                <select
                  style={styles.editSelect}
                  value={editingProgramId}
                  onChange={(event) => setEditingProgramId(event.target.value)}
                  aria-label="Select Program"
                >
                  <option value="">(Select Active Program)</option>
                  {activePrograms.map((program) => (
                    <option key={program.id} value={program.id}>{program.name}</option>
                  ))}
                  {programs
                    .filter((program) =>
                      String(program.id) === editingProgramId &&
                      !activePrograms.some((activeProgram) => activeProgram.id === program.id),
                    )
                    .map((program) => (
                      <option key={program.id} value={program.id}>{program.name}</option>
                    ))}
                </select>
              )}
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
                <option value="">No Linked Goal</option>
                {goals.map((goal) => (
                  <option key={goal.id} value={goal.id}>{goal.title}</option>
                ))}
              </select>
            </div>
            <div className="habit-cell-actions">
              <button
                style={styles.saveButton}
                onClick={() => saveEdit(habit.id)}
                disabled={editingType === "Challenge" && !activePrograms.some((program) => String(program.id) === editingProgramId) && String(habit.programId) !== editingProgramId}
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

    const completedInWindow = countCompletedInWindow(habit, programs);
    const challengeMetadata = getChallengeMetadata(habit, programs);

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
            {habit.type === "Challenge" && challengeMetadata ? (
              <span
                className="habit-type-badge"
                style={{
                  ...styles.challengeBadge,
                  ...(completed ? styles.challengeBadgeCompleted : {}),
                }}
              >
                {completed
                  ? `Program Completed · ${completedInWindow} of ${challengeMetadata.durationDays} ${
                      completedInWindow === 1 ? "Day" : "Days"
                    } Completed`
                  : `Program Day ${Math.min(
                      getChallengeDayNumber(habit, selectedDateKey, programs),
                      challengeMetadata.durationDays,
                    )} of ${challengeMetadata.durationDays} · ${formatCompletedDays(
                      completedInWindow,
                    )}`}
              </span>
            ) : (
              <span
                className="habit-type-badge"
                style={isScheduled ? styles.dailyBadge : styles.offDayBadge}
              >
                {isScheduled ? formatFrequencyLabel(habit) : "Off Day"}
              </span>
            )}
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
    const completedInWindow = countCompletedInWindow(habit, programs);
    const challengeMetadata = getChallengeMetadata(habit, programs);
    const isProgram = habit.type === "Challenge" && !!challengeMetadata;
    const progress = isProgram
      ? Math.min(100, (completedInWindow / challengeMetadata!.durationDays) * 100)
      : doneOnSelectedDate ? 100 : 0;
    const streak = calculateStreak(habit, streakFreeze, appSettings.dayResetHour);

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
              {isProgram
                ? `Program · ${completedInWindow} of ${challengeMetadata!.durationDays} days`
                : formatFrequencyLabel(habit)}
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

  return (
    <div className="app-shell">
      <div className="app-body">
        <nav className="sidebar" aria-label="Main navigation">
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
            className={`sidebar-item ${view === "Timer" ? "active" : ""}`}
            onClick={() => navigateToView("Timer")}
            aria-current={view === "Timer" ? "page" : undefined}
          >
            <TimerIcon size={18} />
            <span>Timer</span>
            <span className="sidebar-shortcut">{shortcutKey}3</span>
          </button>
          <button
            className={`sidebar-item ${view === "Programs" ? "active" : ""}`}
            onClick={() => navigateToView("Programs")}
            aria-current={view === "Programs" ? "page" : undefined}
          >
            <Flame size={18} />
            <span>Programs</span>
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
              focusSessions={focusSessions}
              onToggleHabit={(id, dateKey) => toggleHabit(id, dateKey)}
              onToggleTask={(taskId) =>
                setTasks((current) => current.map((task) =>
                  task.id === taskId ? toggleTaskCompletion(task) : task,
                ))
              }
              onStartFocus={(entityId) => {
                setInitialFocusEntityId(entityId);
                navigateToView("Timer");
              }}
              onNavigateToHabits={() => navigateToView("Habits")}
              onNavigateToPrograms={() => navigateToView("Programs")}
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
              <div className="category-tabs" role="group" aria-label="Filter habits by category">
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
                          Type
                        </label>
                        <select
                          style={{ ...styles.select, width: "100%", minWidth: 0 }}
                          value={filterType}
                          onChange={(event) => setFilterType(event.target.value as "All" | "Daily" | "Program Habits")}
                        >
                          <option value="All">All</option>
                          <option value="Daily">Daily</option>
                          <option value="Program Habits">Program Habits</option>
                        </select>
                      </div>
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
                    aria-label="Manage custom categories"
                    aria-expanded={habitsPopover === "category"}
                    title="Manage custom categories"
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
                            style={{ ...styles.input, minWidth: 0, padding: "7px 10px" }}
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
                disabled={newType === "Challenge" && !activePrograms.some((program) => String(program.id) === newProgramId)}
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
              <select
                style={styles.habitPropertySelect}
                value={newType}
                onChange={(event) => {
                  const type = event.target.value as HabitType;
                  setNewType(type);
                  if (type === "Daily") setNewProgramId("");
                }}
                aria-label="Type"
              >
                <option value="Daily">Daily Habit</option>
                <option value="Challenge">Program</option>
              </select>
              {newType === "Challenge" && (
                <select
                  style={styles.habitPropertySelect}
                  value={newProgramId}
                  onChange={(event) => setNewProgramId(event.target.value)}
                  aria-label="Select Program"
                >
                  <option value="">Select a Program</option>
                  {activePrograms.map((program) => (
                    <option key={program.id} value={program.id}>{program.name}</option>
                  ))}
                </select>
              )}
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
                <option value="">No Linked Goal</option>
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
              soundAlerts={appSettings.soundAlerts}
              goals={goals}
              milestones={milestones}
              tasks={tasks}
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
              display: view === "Programs" ? "flex" : "none",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
            }}
          >
            <Programs
              habits={habits}
              programs={programViews}
              onToggleHabit={(id, dateKey) => toggleHabit(id, dateKey)}
              onCreateProgram={() => setShowProgramModal(true)}
              onEditProgram={startProgramEdit}
              onToggleProgramArchive={toggleProgramArchive}
              onDeleteProgram={requestProgramDeletion}
              dayResetHour={appSettings.dayResetHour}
              onEditHabit={startProgramHabitEdit}
              onArchiveHabit={archiveHabit}
              onUnarchiveHabit={unarchiveHabit}
              onDeleteHabit={requestHabitDeletion}
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
              onAddTask={(data) => setTasks((current) => [...current, createTask(data)])}
              onToggleTask={(taskId) =>
                setTasks((current) => current.map((task) =>
                  task.id === taskId ? toggleTaskCompletion(task) : task,
                ))
              }
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
                setHabits((current) => current.map((habit) =>
                  habit.goalId === goalId ? { ...habit, goalId: undefined } : habit,
                ));
              }}
              onEditTask={(taskId, data) =>
                setTasks((current) => current.map((task) =>
                  task.id === taskId ? updateTask(task, data) : task,
                ))
              }
              onDeleteTask={(taskId) =>
                setTasks((current) => deleteTask(current, taskId))
              }
              onAddMilestone={(data) => setMilestones((current) => [...current, createMilestone(data)])}
              onEditMilestone={(milestoneId, data) =>
                setMilestones((current) => current.map((milestone) =>
                  milestone.id === milestoneId ? updateMilestone(milestone, data) : milestone,
                ))
              }
              onDeleteMilestone={(milestoneId) => {
                const milestone = milestones.find((item) => item.id === milestoneId);
                if (milestone) {
                  setTasks((current) => detachTasksFromDeletedMilestone(current, milestone));
                }
                setMilestones((current) => deleteMilestone(current, milestoneId));
              }}
              onToggleMilestone={(goalId, milestoneId) =>
                setMilestones((current) => current.map((milestone) =>
                  milestone.goalId === goalId && milestone.id === milestoneId
                    ? toggleMilestone(milestone)
                    : milestone,
                ))
              }
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
              <p style={styles.subtitle}>Manage your app preferences and defaults.</p>

              <section style={styles.settingsCard} aria-labelledby="general-settings-title">
                <h2 id="general-settings-title" style={styles.settingsCardTitle}>
                  <CalendarDays size={17} />
                  General
                </h2>
                <div className="settings-row" style={styles.settingsRow}>
                  <div>
                    <span style={styles.settingsLabel}>Appearance</span>
                    <span style={styles.settingsDescription}>Choose your preferred color theme.</span>
                  </div>
                  <div className="settings-segment" style={styles.settingsSegment} role="group" aria-label="Appearance theme">
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
                    aria-label="Default view mode"
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
                  <div style={styles.settingsSegment} role="group" aria-label="Start of week">
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
              </section>

              <section style={styles.settingsCard} aria-labelledby="today-task-settings-title">
                <h2 id="today-task-settings-title" style={styles.settingsCardTitle}>
                  <ListChecks size={17} />
                  Today &amp; Task Settings
                </h2>
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
              </section>

              <section style={styles.settingsCard} aria-labelledby="focus-defaults-title">
                <h2 id="focus-defaults-title" style={styles.settingsCardTitle}>
                  <Clock3 size={17} />
                  Focus Timer Defaults
                </h2>
                <div style={styles.settingsRow}>
                  <div>
                    <span style={styles.settingsLabel}>Default Focus Duration</span>
                    <span style={styles.settingsDescription}>Applied to the Timer and Pomodoro focus duration.</span>
                  </div>
                  <div style={styles.settingsSegment} role="group" aria-label="Default focus duration">
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
                      aria-label="Quick adjust step size"
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
                        aria-label="Custom quick adjust step in minutes"
                      />
                    )}
                    {!([1, 5, 10].includes(appSettings.quickAdjustStepMinutes)) && (
                      <span style={styles.durationLabel}>Minutes</span>
                    )}
                  </div>
                </div>
                <div style={styles.settingsRow}>
                  <div>
                    <span style={styles.settingsLabel}>Sound Alerts</span>
                    <span style={styles.settingsDescription}>Play chime on timer completion.</span>
                  </div>
                  <SettingsSwitch
                    label="Play chime on timer completion"
                    checked={appSettings.soundAlerts}
                    onChange={() => setAppSettings((current) => ({ ...current, soundAlerts: !current.soundAlerts }))}
                  />
                </div>
              </section>

              <section style={styles.settingsCard} aria-labelledby="intelligent-notifications-title">
                <h2 id="intelligent-notifications-title" style={styles.settingsCardTitle}>
                  <Bell size={17} />
                  Intelligent Notifications
                </h2>
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
                    <div key={setting} style={styles.settingsRow}>
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
              </section>

              <section style={styles.settingsCard} aria-labelledby="about-system-title">
                <h2 id="about-system-title" style={styles.settingsCardTitle}>About &amp; System Info</h2>
                <div style={styles.settingsAboutRow}>
                  <div>
                    <span style={styles.settingsAppName}>Synchron</span>
                    <span style={styles.settingsVersion}>
                      {appVersion ? `v${appVersion}` : "Version unavailable"}
                    </span>
                  </div>
                  <button
                    type="button"
                    style={styles.settingsActionButton}
                    onClick={openKeyboardShortcuts}
                  >
                    <Keyboard size={15} />
                    Keyboard Shortcuts
                    <span style={{ color: "var(--text-secondary)", fontSize: 11 }}>{shortcutKey}K</span>
                  </button>
                </div>
              </section>
            </div>
          </div>

        </main>
      </div>
      {programPendingDeletion && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setProgramPendingDeletion(null)}
        >
          <div
            className="delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-program-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="delete-program-modal-title">Delete "{programPendingDeletion.name}"?</h2>
            <p>This will remove the Program and all of its habits.</p>
            <div className="delete-modal-actions">
              <button
                type="button"
                className="delete-modal-cancel"
                onClick={() => setProgramPendingDeletion(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="delete-modal-confirm"
                onClick={confirmProgramDeletion}
              >
                Delete Program
              </button>
            </div>
          </div>
        </div>
      )}

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

      {showProgramModal && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={closeProgramModal}
        >
          <div
            className="program-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="program-modal-title"
            onClick={(event) => event.stopPropagation()}
            style={{
              ...CARD_SURFACE,
              background: "var(--bg-surface)",
              maxWidth: 500,
              width: "90%",
              padding: 24,
              maxHeight: "80vh",
              overflowY: "auto",
            }}
          >
            <h2 id="program-modal-title" style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 16px" }}>
              {programEditingId === null ? "Create Program" : "Edit Program"}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Program Name
                </label>
                <input
                  style={styles.input}
                  value={programName}
                  onChange={(event) => setProgramName(event.target.value)}
                  placeholder="e.g., 21-Day Exam Sprint"
                />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Start Date
                </label>
                <input
                  style={styles.input}
                  type="date"
                  value={programStartDate}
                  onChange={(event) => setProgramStartDate(event.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Duration (Days)
                </label>
                <input
                  style={styles.input}
                  type="number"
                  min={1}
                  value={programDuration}
                  onChange={(event) => setProgramDuration(event.target.value)}
                />
              </div>
              {programEditingId === null && <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Program Habits
                </label>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    style={styles.input}
                    value={newHabit}
                    onChange={(event) => setNewHabit(event.target.value)}
                    placeholder="Add a Habit"
                  />
                  <select
                    style={styles.select}
                    value={newPriority}
                    onChange={(event) => setNewPriority(event.target.value as Priority)}
                  >
                    <option value="Optional">Optional</option>
                    <option value="Mandatory">Mandatory</option>
                  </select>
                  <button
                    style={styles.addButton}
                    onClick={addProgramHabit}
                  >
                    Add
                  </button>
                </div>
                {programHabits.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {programHabits.map((habit, index) => (
                      <div key={index} style={{
                        ...CARD_SURFACE,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: 12,
                      }}>
                        <div>
                          <div style={{ fontSize: 14, color: "var(--text-body)" }}>{habit.name}</div>
                          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{habit.priority}</div>
                        </div>
                        <button
                          style={styles.iconButton}
                          onClick={() => removeProgramHabit(index)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                <button
                  style={styles.cancelButton}
                  onClick={closeProgramModal}
                >
                  Cancel
                </button>
                <button
                  style={styles.saveButton}
                  onClick={createProgram}
                  disabled={programName.trim() === "" || (programEditingId === null && programHabits.length === 0)}
                >
                  {programEditingId === null ? "Create Program" : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showKeyboardShortcuts && (
        <KeyboardShortcutsModal onClose={() => setShowKeyboardShortcuts(false)} shortcutKey={shortcutKey} />
      )}
    </div>
  );
}

export default App;