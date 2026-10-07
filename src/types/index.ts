// Core domain types
export type Priority = "Mandatory" | "Optional";
export type HabitType = "Daily";
export type FrequencyType = "daily" | "weekdays" | "weekends" | "custom";
export type WeekStart = "Sunday" | "Monday";
export type Theme = "dark" | "light";
export type NotificationFrequency = "conservative" | "balanced" | "frequent";
export type View = "Today" | "Habits" | "Tasks" | "Timer" | "Projects" | "goals" | "History" | "Analytics" | "Settings";

export interface AppSettings {
  viewMode: "grid" | "list";
  dayResetHour: number;
  weekStart: WeekStart;
  defaultFocusDuration: number;
  quickAdjustStepMinutes: number;
  soundAlerts: boolean;
  sfxVolume: number;
  sfxEnabled: {
    start: boolean;
    pauseResume: boolean;
    habitComplete: boolean;
    pomodoroTransition: boolean;
    timerComplete: boolean;
  };
  showMandatoryHabitsInImportantItems?: boolean;
  enableIntelligentNotifications: boolean;
  notificationFrequency: NotificationFrequency;
  habitReminders: boolean;
  incompleteHabitReminders: boolean;
  theme: Theme;
  onboardingCompleted: boolean;
}

export interface Habit {
  id: number;
  name: string;
  createdAt?: string; // Local calendar date in YYYY-MM-DD format
  goalId?: string;
  priority: Priority;
  type: HabitType;
  frequencyType?: FrequencyType;
  customDays?: string[];
  completedDates: string[]; // "YYYY-MM-DD" local calendar days this habit was completed
  streakFreezeDates?: string[]; // "YYYY-MM-DD" local calendar days with individual streak freeze
  isArchived?: boolean; // if true, habit is archived and hidden from active list
  category?: string; // optional Title Case label, e.g. "School"
  scheduledTime?: string; // "HH:MM" format for time blocking
  durationMinutes?: number; // estimated duration in minutes for time blocking
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
  habitId?: number;
  taskId?: string;
  goalId?: string;
  milestoneId?: string;
  projectId?: string;
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
  milestones?: Milestone[];
}

export interface Project {
  id: string;
  goalId?: string;
  name: string;
  description?: string;
  startDate?: string;
  targetDate?: string;
  status: 'planned' | 'active' | 'completed' | 'archived';
  createdAt: string;
}

export interface Milestone {
  id: string;
  goalId?: string;
  projectId?: string;
  title: string;
  targetDate?: string;
  completed: boolean;
}

export interface Task {
  id: string;
  milestoneId?: string;
  goalId?: string;
  projectId?: string;
  title: string;
  dueDate?: string;
  estimatedMinutes?: number;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
  scheduledTime?: string; // "HH:MM" format for time blocking
  durationMinutes?: number; // estimated duration in minutes for time blocking
}