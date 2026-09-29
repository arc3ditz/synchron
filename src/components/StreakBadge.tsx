import { Flame } from "lucide-react";

type StreakBadgeProps = {
  streak: number;
  className?: string;
};

export default function StreakBadge({ streak, className }: StreakBadgeProps) {
  return (
    <span className={`streak-pill${className ? ` ${className}` : ""}`}>
      <Flame className="streak-pill-icon" size={14} />
      <span>{streak || 0}</span>
    </span>
  );
}