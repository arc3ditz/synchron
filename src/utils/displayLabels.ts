import type { FrequencyType, Project, Task } from "../types";

export const TASK_PRIORITY_LABELS: Record<Task["priority"], string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const PROJECT_STATUS_LABELS: Record<Project["status"], string> = {
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

export const FREQUENCY_LABELS: Record<FrequencyType, string> = {
  daily: "Everyday",
  weekdays: "Weekdays",
  weekends: "Weekends",
  custom: "Custom Days",
};
