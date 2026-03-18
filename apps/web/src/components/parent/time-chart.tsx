"use client";

interface TimeChartProps {
  data: { date: string; minutes: number }[];
}

/**
 * Simple bar chart showing daily learning time.
 * Pure CSS — no chart library dependency.
 */
export function TimeChart({ data }: TimeChartProps) {
  if (data.length === 0) return null;

  const maxMinutes = Math.max(...data.map((d) => d.minutes), 1);

  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex items-end gap-1 h-32">
        {data.map((entry) => {
          const height = Math.max((entry.minutes / maxMinutes) * 100, 2);
          // Parse YYYY-MM-DD as local date (not UTC) to avoid off-by-one in western timezones
          const [year, month, day] = entry.date.split("-").map(Number);
          const dayLabel = new Date(year, month - 1, day).toLocaleDateString("en-US", {
            weekday: "short",
          });
          return (
            <div
              key={entry.date}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <span className="text-[10px] text-muted-foreground">
                {Math.round(entry.minutes)}m
              </span>
              <div
                className="w-full bg-blue-500 rounded-t transition-all"
                style={{ height: `${height}%` }}
                title={`${entry.date}: ${Math.round(entry.minutes)} minutes`}
              />
              <span className="text-[10px] text-muted-foreground">
                {dayLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
