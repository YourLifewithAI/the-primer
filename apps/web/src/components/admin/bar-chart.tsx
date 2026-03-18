"use client";

/**
 * Pure CSS bar chart component. No chart library needed.
 * Renders horizontal or vertical bar charts using Tailwind.
 */
export function BarChart({
  data,
  direction = "vertical",
  height = 200,
  barColor = "bg-primary",
  showValues = true,
}: {
  data: { label: string; value: number; color?: string }[];
  direction?: "horizontal" | "vertical";
  height?: number;
  barColor?: string;
  showValues?: boolean;
}) {
  if (data.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        No data to display
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);

  if (direction === "horizontal") {
    return (
      <div className="space-y-2">
        {data.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="text-xs text-muted-foreground w-24 truncate text-right">
              {item.label}
            </div>
            <div className="flex-1 h-6 bg-border/30 rounded overflow-hidden">
              <div
                className={`h-full rounded transition-all ${item.color ?? barColor}`}
                style={{ width: `${(item.value / maxValue) * 100}%` }}
              />
            </div>
            {showValues && (
              <div className="text-xs text-muted-foreground w-12 text-right">
                {item.value.toLocaleString()}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Vertical bar chart
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((item, i) => {
        const pct = (item.value / maxValue) * 100;
        return (
          <div
            key={i}
            className="flex-1 flex flex-col items-center justify-end gap-1"
            style={{ height: "100%" }}
          >
            {showValues && (
              <div className="text-[10px] text-muted-foreground">
                {item.value > 999 ? `${(item.value / 1000).toFixed(1)}k` : item.value}
              </div>
            )}
            <div
              className={`w-full rounded-t transition-all ${item.color ?? barColor}`}
              style={{ height: `${Math.max(pct, 2)}%` }}
              title={`${item.label}: ${item.value}`}
            />
            <div className="text-[10px] text-muted-foreground truncate w-full text-center">
              {item.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Simple sparkline-style line representation using CSS.
 * Shows a series of dots connected by a gradient background.
 */
export function SparkLine({
  data,
  height = 40,
  color = "bg-primary",
}: {
  data: number[];
  height?: number;
  color?: string;
}) {
  if (data.length === 0) return null;

  const max = Math.max(...data, 1);

  return (
    <div className="flex items-end gap-px" style={{ height }}>
      {data.map((value, i) => (
        <div
          key={i}
          className={`flex-1 rounded-t ${color} opacity-70`}
          style={{ height: `${Math.max((value / max) * 100, 4)}%` }}
        />
      ))}
    </div>
  );
}
