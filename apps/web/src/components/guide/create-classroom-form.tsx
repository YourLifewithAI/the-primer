"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Course {
  id: string;
  title: string;
  subject: string;
}

export function CreateClassroomForm({ courses }: { courses: Course[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [courseId, setCourseId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/guide/classrooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || undefined,
          courseId: courseId || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create classroom");
      }

      const data = await res.json();
      router.push(`/guide/classrooms/${data.classroom.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="name"
          className="block text-sm font-medium mb-1"
        >
          Classroom Name *
        </label>
        <input
          id="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Period 3 Math"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div>
        <label
          htmlFor="description"
          className="block text-sm font-medium mb-1"
        >
          Description
        </label>
        <input
          id="description"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div>
        <label
          htmlFor="courseId"
          className="block text-sm font-medium mb-1"
        >
          Course
        </label>
        <select
          id="courseId"
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">No specific course</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} ({c.subject})
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
      )}

      <button
        type="submit"
        disabled={loading || !name.trim()}
        className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm disabled:opacity-50 cursor-pointer"
      >
        {loading ? "Creating..." : "Create Classroom"}
      </button>
    </form>
  );
}
