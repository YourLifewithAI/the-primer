"use client";

interface Activity {
  id: string;
  type: "problem" | "lesson" | "tutor" | "review";
  title: string;
  correct?: boolean;
  createdAt: string;
}

export function ChildActivityFeed({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No recent activity.</p>
    );
  }

  return (
    <div className="border border-border rounded-lg divide-y divide-border">
      {activities.map((activity) => (
        <div
          key={activity.id}
          className="flex items-center justify-between px-4 py-3 text-sm"
        >
          <div className="flex items-center gap-3">
            <ActivityIcon type={activity.type} correct={activity.correct} />
            <span>{activity.title}</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {formatTimeAgo(new Date(activity.createdAt))}
          </span>
        </div>
      ))}
    </div>
  );
}

function ActivityIcon({
  type,
  correct,
}: {
  type: string;
  correct?: boolean;
}) {
  if (type === "problem") {
    return (
      <span className={correct ? "text-green-500" : "text-amber-500"}>
        {correct ? "\u2713" : "\u2717"}
      </span>
    );
  }
  if (type === "tutor") {
    return <span className="text-blue-500">AI</span>;
  }
  if (type === "review") {
    return <span className="text-purple-500">R</span>;
  }
  return <span className="text-muted-foreground">L</span>;
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
