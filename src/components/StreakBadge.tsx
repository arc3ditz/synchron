import { Flame } from "lucide-react";

type StreakBadgeProps = {
  streak: number;
  className?: string;
};

export default function StreakBadge({ streak, className }: StreakBadgeProps) {
  return (
    <span className={`streak-pill${className ? ` ${className}` : ""}`} title={`${streak || 0} day streak`}>
      <Flame className="streak-pill-icon" size={13} aria-hidden="true" />
      <span className="ui-numeric">{streak || 0}</span>
    </span>
  );
}
