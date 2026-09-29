// Core domain types
export type Priority = "Mandatory" | "Optional";
export type HabitType = "Daily" | "Challenge";
export type FrequencyType = "daily" | "weekdays" | "weekends" | "custom";
export type WeekStart = "Sunday" | "Monday";
export type Theme = "dark" | "light";
export type View = "Today" | "Habits" | "Timer" | "History" | "Analytics" | "goals" | "Settings";

export interface AppSettings {
  dayResetHour: number;
  weekStart: WeekStart;
  defaultFocusDuration: number;
  quickAdjustStepMinutes: number;
  soundAlerts: boolean;
  theme: Theme;
}

export interface Habit {
  id: number;
  name: string;
  priority: Priority;
  type: HabitType;
  frequencyType?: FrequencyType;
  customDays?: string[];
  durationDays?: number; // only meaningful when type === "Challenge"
  startDate?: string; // "YYYY-MM-DD", only meaningful when type === "Challenge"
  completedDates: string[]; // "YYYY-MM-DD" local calendar days this habit was completed
  isArchived?: boolean; // if true, habit is archived and hidden from active list
  category?: string; // optional Title Case label, e.g. "School"
}

export interface Summary {
  total: number;
  doneCount: number;
  percent: number;
  mandatoryTotal: number;
  mandatoryDone: number;
}

// History component types
export interface HistoryHabit {
  id: number;
  name: string;
  completedDates: string[];
  frequencyType?: "daily" | "weekdays" | "weekends" | "custom";
  customDays?: string[];
}

export interface FocusSessionRecord {
  id: number;
  timestamp: number;
  sessionType: "Timer" | "Pomodoro Focus";
  durationMinutes: number;
  habitName: string;
}

// Analytics component types (subset of Habit)
export interface AnalyticsHabit {
  id: number;
  name: string;
  completedDates: string[];
  frequencyType?: "daily" | "weekdays" | "weekends" | "custom";
  customDays?: string[];
  isArchived?: boolean;
}

// FocusTimer component types (minimal subset of Habit)
export interface FocusTimerHabit {
  id: number;
  name: string;
}

// Shared UI types
export type TimeHorizon = "This Week" | "This Month" | "Last 30 Days" | "All Time";
export type Mode = "Timer" | "Pomodoro";
export type Session = "Focus" | "Break";

// KeyboardShortcutsModal component types
export interface ShortcutGroup {
  title: string;
  shortcuts: {
    keys: string;
    description: string;
  }[];
}

export interface KeyboardShortcutsModalProps {
  onClose: () => void;
  shortcutKey: string;
}

// New domain interfaces for goals, milestones, and tasks
export interface Goal {
  id: string;
  title: string;
  description?: string;
  targetDate?: string;
  status: 'active' | 'completed' | 'archived';
  createdAt: string;
}

export interface Milestone {
  id: string;
  goalId: string;
  title: string;
  targetDate?: string;
  completed: boolean;
}

export interface Task {
  id: string;
  milestoneId?: string;
  goalId?: string;
  title: string;
  dueDate?: string;
  estimatedMinutes?: number;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
}
