import type { ComponentType, SVGProps } from "react";
import {
  ActionsIcon,
  HomeIcon,
  InboxIcon,
  ProjectsIcon,
  SearchIcon,
  SettingsIcon,
  TodayIcon,
} from "./components/icons";

export type SectionId =
  | "home"
  | "today"
  | "projects"
  | "actions"
  | "search"
  | "inbox"
  | "settings";

export interface Section {
  id: SectionId;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export const SECTIONS: Section[] = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "today", label: "Today", icon: TodayIcon },
  { id: "projects", label: "Projects", icon: ProjectsIcon },
  { id: "actions", label: "Actions", icon: ActionsIcon },
  { id: "search", label: "Search", icon: SearchIcon },
  { id: "inbox", label: "Inbox", icon: InboxIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];
