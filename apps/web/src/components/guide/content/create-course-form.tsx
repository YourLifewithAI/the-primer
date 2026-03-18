"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SUBJECTS = [
  { value: "MATH", label: "Mathematics" },
  { value: "SCIENCE", label: "Science" },
  { value: "ELA", label: "English Language Arts" },
  { value: "SOCIAL_STUDIES", label: "Social Studies" },
];

const GRADE_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export function CreateCourseForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState("MATH");
  const [gradeLevels, setGradeLevels] = useState<number[]>([]);
  const [isShared, setIsShared] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleGrade(grade: number) {
    setGradeLevels((prev) =>
      prev.includes(grade) ? prev.filter((g) => g !== grade) : [...prev, grade].sort()
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!gradeLevels.length) {
      setError("Select at least one grade level");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/guide/content/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description: description || undefined, subject, gradeLevels, isShared }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create course");
      }

      const data = await res.json();
      router.push(`/guide/content/courses/${data.course.id}/edit`);
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
          Course Title *
        </label>
        <input
          id="title"
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Grade 5 Mathematics"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium mb-1">
          Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this course cover?"
          rows={3}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-y"
        />
      </div>

      <div>
        <label htmlFor="subject" className="block text-sm font-medium mb-1">
          Subject *
        </label>
        <select
          id="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {SUBJECTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Grade Levels *</label>
        <div className="flex flex-wrap gap-2">
          {GRADE_LEVELS.map((grade) => (
            <button
              key={grade}
              type="button"
              onClick={() => toggleGrade(grade)}
              className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                gradeLevels.includes(grade)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-accent"
              }`}
            >
              {grade}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="isShared"
          type="checkbox"
          checked={isShared}
          onChange={(e) => setIsShared(e.target.checked)}
          className="rounded border-border"
        />
        <label htmlFor="isShared" className="text-sm">
          Share with other guides (visible in shared content library)
        </label>
      </div>

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
      )}

      <button
        type="submit"
        disabled={loading || !title.trim()}
        className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm disabled:opacity-50 cursor-pointer"
      >
        {loading ? "Creating..." : "Create Course"}
      </button>
    </form>
  );
}
