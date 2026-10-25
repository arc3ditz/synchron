import type { ComponentType, SVGProps } from "react";
import {
  ActionsIcon,
  InboxIcon,
  ProjectsIcon,
  SettingsIcon,
  TodayIcon,
} from "./components/icons";

export type SectionId = "today" | "projects" | "actions" | "inbox" | "settings";

export interface Section {
  id: SectionId;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Heading for the empty state — placeholder copy only, no product logic. */
  emptyTitle: string;
  emptyBody: string;
}

export const SECTIONS: Section[] = [
  {
    id: "today",
    label: "Today",
    icon: TodayIcon,
    emptyTitle: "Nothing planned for today.",
    emptyBody: "Anything you capture for today will appear here.",
  },
  {
    id: "projects",
    label: "Projects",
    icon: ProjectsIcon,
    emptyTitle: "No projects yet.",
    emptyBody: "Create a project to keep related work in one place.",
  },
  {
    id: "actions",
    label: "Actions",
    icon: ActionsIcon,
    emptyTitle: "No open actions.",
    emptyBody: "Everything you are tracking will appear here.",
  },
  {
    id: "inbox",
    label: "Inbox",
    icon: InboxIcon,
    emptyTitle: "The inbox is empty.",
    emptyBody: "Captured items land here first, ready to be triaged.",
  },
  {
    id: "settings",
    label: "Settings",
    icon: SettingsIcon,
    emptyTitle: "No preferences yet.",
    emptyBody: "Appearance and workspace settings will appear here.",
  },
];
