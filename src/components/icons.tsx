import {
  CalendarDays,
  Check,
  Circle,
  CircleDot,
  Folder,
  House,
  Inbox,
  ListChecks,
  Moon,
  Pencil,
  Plus,
  Settings2,
  Sun,
  Trash2,
} from "lucide-react";
import type { LucideProps } from "lucide-react";

const sharedProps = { size: 18, strokeWidth: 1.7 } as const;

export function HomeIcon(props: LucideProps) { return <House {...sharedProps} {...props} />; }
export function TodayIcon(props: LucideProps) { return <CalendarDays {...sharedProps} {...props} />; }
export function ProjectsIcon(props: LucideProps) { return <Folder {...sharedProps} {...props} />; }
export function ActionsIcon(props: LucideProps) { return <ListChecks {...sharedProps} {...props} />; }
export function InboxIcon(props: LucideProps) { return <Inbox {...sharedProps} {...props} />; }
export function SettingsIcon(props: LucideProps) { return <Settings2 {...sharedProps} {...props} />; }
export function SunIcon(props: LucideProps) { return <Sun {...sharedProps} {...props} />; }
export function MoonIcon(props: LucideProps) { return <Moon {...sharedProps} {...props} />; }
export function SystemIcon(props: LucideProps) { return <CircleDot {...sharedProps} {...props} />; }

export function CheckIcon(props: LucideProps) { return <Check {...sharedProps} {...props} />; }
export function EditIcon(props: LucideProps) { return <Pencil {...sharedProps} {...props} />; }
export function TrashIcon(props: LucideProps) { return <Trash2 {...sharedProps} {...props} />; }
export function PlusIcon(props: LucideProps) { return <Plus {...sharedProps} {...props} />; }
export function CalendarIcon(props: LucideProps) { return <CalendarDays {...sharedProps} {...props} />; }
export function ClockIcon(props: LucideProps) { return <Circle {...sharedProps} {...props} />; }
