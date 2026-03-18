"use client";

interface KCHeatmapEntry {
  kcId: string;
  kcName: string;
  averageMastery: number;
  masteredCount: number;
  attemptedCount: number;
  totalStudents: number;
  isStrugglingTopic: boolean;
}

export function KCHeatmap({ entries }: { entries: KCHeatmapEntry[] }) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="hidden md:grid md:grid-cols-[1fr_100px_100px_100px] gap-2 px-4 py-2 bg-border/30 text-xs text-muted-foreground font-medium">
        <div>Knowledge Component</div>
        <div className="text-right">Avg Mastery</div>
        <div className="text-right">Mastered</div>
        <div className="text-right">Attempted</div>
      </div>

      <div className="divide-y divide-border">
        {entries.map((entry) => (
          <div
            key={entry.kcId}
            className={`flex flex-col md:grid md:grid-cols-[1fr_100px_100px_100px] gap-1 md:gap-2 px-4 py-3 md:items-center ${
              entry.isStrugglingTopic
                ? "bg-red-50 dark:bg-red-950/30"
                : ""
            }`}
          >
            <div className="flex items-center gap-2">
              {entry.isStrugglingTopic && (
                <span className="text-red-500 text-xs font-medium">!</span>
              )}
              <span className="text-sm font-medium">{entry.kcName}</span>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-2">
                <div className="w-16 h-2 bg-border rounded-full overflow-hidden hidden md:block">
                  <div
                    className={`h-full rounded-full ${getMasteryColor(entry.averageMastery)}`}
                    style={{
                      width: `${Math.round(entry.averageMastery * 100)}%`,
                    }}
                  />
                </div>
                <span className="text-sm">
                  {Math.round(entry.averageMastery * 100)}%
                </span>
              </div>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              {entry.masteredCount}/{entry.totalStudents}
            </div>
            <div className="text-right text-sm text-muted-foreground">
              {entry.attemptedCount}/{entry.totalStudents}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getMasteryColor(mastery: number): string {
  if (mastery >= 0.95) return "bg-green-500";
  if (mastery >= 0.7) return "bg-blue-500";
  if (mastery >= 0.4) return "bg-amber-500";
  return "bg-red-400";
}
