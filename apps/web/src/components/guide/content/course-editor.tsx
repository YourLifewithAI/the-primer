"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface LessonSummary {
  id: string;
  title: string;
  status: string;
  orderIndex: number;
  _count: { problems: number };
}

interface ModuleWithLessons {
  id: string;
  title: string;
  orderIndex: number;
  lessons: LessonSummary[];
}

interface CourseData {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  gradeLevel: number[];
  published: boolean;
  isShared: boolean;
  modules: ModuleWithLessons[];
}

const SUBJECTS = [
  { value: "MATH", label: "Mathematics" },
  { value: "SCIENCE", label: "Science" },
  { value: "ELA", label: "English Language Arts" },
  { value: "SOCIAL_STUDIES", label: "Social Studies" },
];

export function CourseEditor({
  course,
  isOwner,
}: {
  course: CourseData;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description ?? "");
  const [subject, setSubject] = useState(course.subject);
  const [published, setPublished] = useState(course.published);
  const [isShared, setIsShared] = useState(course.isShared);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Module management
  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [addingModule, setAddingModule] = useState(false);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/guide/content/courses/${course.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || undefined,
          subject,
          published,
          isShared,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save");
      }
      setMessage("Saved!");
      setTimeout(() => setMessage(null), 2000);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddModule() {
    if (!newModuleTitle.trim()) return;
    setAddingModule(true);
    try {
      // Create module via direct API — we need a module creation endpoint
      // For now, use the course update pattern
      const res = await fetch(`/api/guide/content/courses/${course.id}/modules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newModuleTitle.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to add module");
      }
      setNewModuleTitle("");
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to add module");
    } finally {
      setAddingModule(false);
    }
  }

  async function handleDeleteCourse() {
    if (!confirm("Are you sure you want to delete this course? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/guide/content/courses/${course.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to delete");
      }
      router.push("/guide/content");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/guide/content"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; Content Library
          </Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-2xl font-bold">Edit Course</h1>
        </div>
        {isOwner && (
          <button
            onClick={handleDeleteCourse}
            className="text-xs text-red-600 hover:text-red-700 dark:text-red-400"
          >
            Delete Course
          </button>
        )}
      </div>

      {/* Course metadata */}
      <div className="border border-border rounded-lg p-5 mb-6">
        <h2 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wide">
          Course Details
        </h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium mb-1">
              Title
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!isOwner}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor="desc" className="block text-sm font-medium mb-1">
              Description
            </label>
            <textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!isOwner}
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 resize-y"
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label htmlFor="subject" className="block text-sm font-medium mb-1">
                Subject
              </label>
              <select
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={!isOwner}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              >
                {SUBJECTS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">
                Grade Levels
              </label>
              <div className="text-sm text-muted-foreground">
                {course.gradeLevel.join(", ")}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={published}
                onChange={(e) => setPublished(e.target.checked)}
                disabled={!isOwner}
                className="rounded border-border"
              />
              Published
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isShared}
                onChange={(e) => setIsShared(e.target.checked)}
                disabled={!isOwner}
                className="rounded border-border"
              />
              Shared with other guides
            </label>
          </div>

          {isOwner && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm disabled:opacity-50 cursor-pointer"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
              {message && (
                <span className="text-sm text-muted-foreground">{message}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modules & Lessons */}
      <div className="border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Modules & Lessons
          </h2>
        </div>

        {course.modules.length === 0 ? (
          <p className="text-sm text-muted-foreground mb-4">
            No modules yet. Add your first module to start building lessons.
          </p>
        ) : (
          <div className="space-y-4 mb-4">
            {course.modules.map((mod) => (
              <div key={mod.id} className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium">{mod.title}</h3>
                  <span className="text-xs text-muted-foreground">
                    {mod.lessons.length} lesson{mod.lessons.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {mod.lessons.length > 0 && (
                  <div className="space-y-1 mb-3">
                    {mod.lessons.map((lesson) => (
                      <Link
                        key={lesson.id}
                        href={`/guide/content/lessons/${lesson.id}/edit`}
                        className="flex items-center justify-between px-3 py-2 rounded hover:bg-accent transition-colors text-sm"
                      >
                        <span>{lesson.title}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            lesson.status === "PUBLISHED"
                              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                              : lesson.status === "ARCHIVED"
                              ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                              : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                          }`}>
                            {lesson.status}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {lesson._count.problems} problem{lesson._count.problems !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}

                {isOwner && (
                  <Link
                    href={`/guide/content/lessons/new?moduleId=${mod.id}&courseId=${course.id}`}
                    className="text-xs text-primary hover:underline"
                  >
                    + Add Lesson
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add Module */}
        {isOwner && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newModuleTitle}
              onChange={(e) => setNewModuleTitle(e.target.value)}
              placeholder="New module title"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddModule();
                }
              }}
            />
            <button
              onClick={handleAddModule}
              disabled={addingModule || !newModuleTitle.trim()}
              className="px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors text-sm disabled:opacity-50 cursor-pointer"
            >
              {addingModule ? "Adding..." : "Add Module"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
