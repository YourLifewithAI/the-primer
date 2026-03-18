"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Lesson {
  id: string;
  title: string;
}

export function CreateAssignmentForm({
  classroomId,
  lessons,
}: {
  classroomId: string;
  lessons: Lesson[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [lessonId, setLessonId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/guide/classrooms/${classroomId}/assignments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            description: description || undefined,
            lessonId: lessonId || undefined,
            dueDate: dueDate || undefined,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create assignment");
      }

      setTitle("");
      setDescription("");
      setLessonId("");
      setDueDate("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-primary hover:underline cursor-pointer"
      >
        + Create Assignment
      </button>
    );
  }

  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium">New Assignment</h3>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        >
          Cancel
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="assign-title" className="block text-xs text-muted-foreground mb-1">
            Title *
          </label>
          <input
            id="assign-title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Practice Distributive Property"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label htmlFor="assign-desc" className="block text-xs text-muted-foreground mb-1">
            Description
          </label>
          <input
            id="assign-desc"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional instructions for students"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        {lessons.length > 0 && (
          <div>
            <label htmlFor="assign-lesson" className="block text-xs text-muted-foreground mb-1">
              Lesson
            </label>
            <select
              id="assign-lesson"
              value={lessonId}
              onChange={(e) => setLessonId(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">General assignment (no specific lesson)</option>
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="assign-due" className="block text-xs text-muted-foreground mb-1">
            Due Date
          </label>
          <input
            id="assign-due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {error && (
          <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
        )}

        <button
          type="submit"
          disabled={loading || !title.trim()}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm disabled:opacity-50 cursor-pointer"
        >
          {loading ? "Creating..." : "Create Assignment"}
        </button>
      </form>
    </div>
  );
}
