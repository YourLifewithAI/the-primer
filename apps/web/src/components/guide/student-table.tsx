"use client";

import Link from "next/link";

interface StudentSummary {
  studentId: string;
  studentName: string | null;
  totalKCs: number;
  masteredKCs: number;
  averageMastery: number;
  totalAttempts: number;
  accuracy: number;
  lastActiveAt: string | null;
  strugglingKCs: number;
  status: "active" | "idle" | "struggling" | "on_track" | "completed";
}

const statusLabels: Record<StudentSummary["status"], string> = {
  active: "Active",
  idle: "Idle",
  struggling: "Struggling",
  on_track: "On Track",
  completed: "Completed",
};

const statusColors: Record<StudentSummary["status"], string> = {
  active: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  idle: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  struggling: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  on_track: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  completed: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
};

export function StudentTable({
  students,
}: {
  students: StudentSummary[];
}) {
  // Sort: struggling first, then idle, active, on_track, completed
  const statusOrder: Record<string, number> = {
    struggling: 0,
    idle: 1,
    active: 2,
    on_track: 3,
    completed: 4,
  };

  const sorted = [...students].sort(
    (a, b) => (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5)
  );

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="hidden md:grid md:grid-cols-[1fr_80px_80px_80px_100px_80px] gap-2 px-4 py-2 bg-border/30 text-xs text-muted-foreground font-medium">
        <div>Student</div>
        <div className="text-right">Mastery</div>
        <div className="text-right">Accuracy</div>
        <div className="text-right">Attempts</div>
        <div className="text-right">Last Active</div>
        <div className="text-center">Status</div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-border">
        {sorted.map((student) => (
          <Link
            key={student.studentId}
            href={`/guide/students/${student.studentId}`}
            className="flex flex-col md:grid md:grid-cols-[1fr_80px_80px_80px_100px_80px] gap-1 md:gap-2 px-4 py-3 hover:bg-border/10 transition-colors items-center"
          >
            <div className="flex items-center gap-2 w-full md:w-auto">
              <span className="font-medium text-sm">
                {student.studentName ?? "Unnamed"}
              </span>
              {student.strugglingKCs > 0 && (
                <span className="text-xs text-red-500">
                  {student.strugglingKCs} struggling
                </span>
              )}
            </div>
            <div className="text-right text-sm">
              {Math.round(student.averageMastery * 100)}%
              <span className="md:hidden text-muted-foreground text-xs ml-1">
                mastery
              </span>
            </div>
            <div className="text-right text-sm">
              {Math.round(student.accuracy * 100)}%
              <span className="md:hidden text-muted-foreground text-xs ml-1">
                accuracy
              </span>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              {student.totalAttempts}
            </div>
            <div className="text-right text-xs text-muted-foreground">
              {student.lastActiveAt
                ? formatTimeAgo(new Date(student.lastActiveAt))
                : "Never"}
            </div>
            <div className="text-center">
              <span
                className={`inline-block text-xs px-2 py-0.5 rounded-full ${statusColors[student.status]}`}
              >
                {statusLabels[student.status]}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
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
