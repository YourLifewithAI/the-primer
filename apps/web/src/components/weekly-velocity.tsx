/**
 * Weekly velocity card — server component.
 * Shows skills mastered in the last 7 days vs the previous 7.
 */

interface WeeklyVelocityProps {
  /** Number of KCs mastered in the last 7 days */
  thisWeek: number;
  /** Number of KCs mastered in the 7 days before that */
  lastWeek: number;
  /** Per-day mastery counts for the last 7 days, [today, yesterday, ..., 6 days ago] */
  dailyCounts: number[];
}

export function WeeklyVelocity({
  thisWeek,
  lastWeek,
  dailyCounts,
}: WeeklyVelocityProps) {
  const maxCount = Math.max(...dailyCounts, 1);
  const dayLabels = getDayLabels();

  const trend =
    thisWeek > lastWeek
      ? "up"
      : thisWeek < lastWeek
        ? "down"
        : "same";

  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm text-muted-foreground">This Week</div>
          <div className="text-2xl font-bold mt-1">
            {thisWeek} skill{thisWeek !== 1 ? "s" : ""}
          </div>
        </div>
        {lastWeek > 0 && (
          <div className="text-right">
            <div className="text-xs text-muted-foreground">vs last week</div>
            <div
              className={`text-sm font-medium mt-0.5 ${
                trend === "up"
                  ? "text-green-600 dark:text-green-400"
                  : trend === "down"
                    ? "text-muted-foreground"
                    : "text-muted-foreground"
              }`}
            >
              {trend === "up" && "+"}
              {thisWeek - lastWeek}
            </div>
          </div>
        )}
      </div>

      {/* Mini bar chart — last 7 days */}
      <div className="flex items-end gap-1 h-10" aria-hidden="true">
        {dailyCounts
          .slice()
          .reverse()
          .map((count, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
              <div
                className={`w-full rounded-sm transition-all ${
                  count > 0 ? "bg-green-500" : "bg-border"
                }`}
                style={{
                  height: count > 0 ? `${Math.max(20, (count / maxCount) * 100)}%` : "4px",
                }}
                title={`${dayLabels[i]}: ${count} mastered`}
              />
            </div>
          ))}
      </div>

      {/* Day labels */}
      <div className="flex gap-1 mt-1" aria-hidden="true">
        {dayLabels.map((label, i) => (
          <div
            key={i}
            className="flex-1 text-center text-[10px] text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Screen reader summary */}
      <div className="sr-only">
        {thisWeek} skills mastered this week.
        {lastWeek > 0 && ` ${lastWeek} skills mastered last week.`}
      </div>
    </div>
  );
}

function getDayLabels(): string[] {
  const labels: string[] = [];
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    labels.push(days[d.getDay()]);
  }
  return labels;
}
