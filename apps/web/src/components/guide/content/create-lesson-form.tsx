"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateLessonForm({
  moduleId,
  courseId,
}: {
  moduleId: string;
  courseId: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"DRAFT" | "PUBLISHED">("DRAFT");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!moduleId) {
      setError("Module ID is required");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/guide/content/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content: content || undefined,
          moduleId,
          status,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create lesson");
      }

      const data = await res.json();
      router.push(`/guide/content/lessons/${data.lesson.id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="title" className="block text-sm font-medium mb-1">
          Lesson Title *
        </label>
        <input
          id="title"
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Understanding Place Value Through Thousandths"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div>
        <label htmlFor="content" className="block text-sm font-medium mb-1">
          Lesson Introduction (Markdown with KaTeX)
        </label>
        <textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={"Explain the concept here...\n\nSupports $inline math$ and $$display math$$"}
          rows={6}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary resize-y"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Use $...$ for inline math and $$...$$ for display math (KaTeX notation)
        </p>
      </div>

      <div>
        <label htmlFor="status" className="block text-sm font-medium mb-1">
          Status
        </label>
        <select
          id="status"
          value={status}
          onChange={(e) => setStatus(e.target.value as "DRAFT" | "PUBLISHED")}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="DRAFT">Draft (only visible to you)</option>
          <option value="PUBLISHED">Published (can be assigned to classrooms)</option>
        </select>
      </div>

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading || !title.trim()}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm disabled:opacity-50 cursor-pointer"
        >
          {loading ? "Creating..." : "Create Lesson"}
        </button>
        {courseId && (
          <button
            type="button"
            onClick={() => router.push(`/guide/content/courses/${courseId}/edit`)}
            className="px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors text-sm"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
