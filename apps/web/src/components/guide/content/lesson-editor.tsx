"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ProblemEditor } from "./problem-editor";
import { MathPreview } from "./math-preview";

interface ProblemKCData {
  kc: { id: string; name: string; subject: string; gradeLevel: number[] };
}

interface ProblemData {
  id: string;
  title: string;
  difficulty: number;
  content: Record<string, unknown>;
  orderIndex: number;
  kcs: ProblemKCData[];
}

interface LessonData {
  id: string;
  title: string;
  content: string | null;
  status: string;
  problems: ProblemData[];
}

interface KCOption {
  id: string;
  name: string;
  subject: string;
  gradeLevel: number[];
}

export function LessonEditor({
  lesson,
  courseId,
  courseTitle,
  moduleName,
  availableKCs,
  isOwner,
}: {
  lesson: LessonData;
  courseId: string;
  courseTitle: string;
  moduleName: string;
  availableKCs: KCOption[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(lesson.title);
  const [content, setContent] = useState(lesson.content ?? "");
  const [status, setStatus] = useState(lesson.status);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [problems, setProblems] = useState(lesson.problems);
  const [addingProblem, setAddingProblem] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/guide/content/lessons/${lesson.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, status }),
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

  async function handleDeleteProblem(problemId: string) {
    if (!confirm("Delete this problem?")) return;
    try {
      const res = await fetch(
        `/api/guide/content/lessons/${lesson.id}/problems/${problemId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete");
      setProblems((prev) => prev.filter((p) => p.id !== problemId));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    setProblems((prev) => {
      const newProblems = [...prev];
      const [dragged] = newProblems.splice(draggedIndex, 1);
      newProblems.splice(index, 0, dragged);
      return newProblems;
    });
    setDraggedIndex(index);
  }, [draggedIndex]);

  const handleDragEnd = useCallback(async () => {
    if (draggedIndex === null) return;
    setDraggedIndex(null);

    // Save the new order
    try {
      const res = await fetch(
        `/api/guide/content/lessons/${lesson.id}/problems/reorder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ problemIds: problems.map((p) => p.id) }),
        }
      );
      if (!res.ok) throw new Error("Failed to reorder");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Reorder failed");
      // Revert on failure
      router.refresh();
    }
  }, [draggedIndex, problems, lesson.id, router]);

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6 flex-wrap">
        <Link href="/guide/content" className="hover:text-foreground">
          Content Library
        </Link>
        <span>/</span>
        <Link
          href={`/guide/content/courses/${courseId}/edit`}
          className="hover:text-foreground"
        >
          {courseTitle}
        </Link>
        <span>/</span>
        <span>{moduleName}</span>
        <span>/</span>
        <span className="text-foreground font-medium">{lesson.title}</span>
      </div>

      {/* Lesson Metadata */}
      <div className="border border-border rounded-lg p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Lesson Details
          </h2>
          <div className="flex items-center gap-3">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={!isOwner}
              className={`text-xs px-2 py-1 rounded border transition-colors ${
                status === "PUBLISHED"
                  ? "border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-200"
                  : status === "ARCHIVED"
                  ? "border-gray-300 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
                  : "border-yellow-300 bg-yellow-50 text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-200"
              }`}
            >
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="lessonTitle" className="block text-sm font-medium mb-1">
              Title
            </label>
            <input
              id="lessonTitle"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!isOwner}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="lessonContent" className="text-sm font-medium">
                Introduction Content (Markdown + KaTeX)
              </label>
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className="text-xs text-primary hover:underline"
              >
                {showPreview ? "Edit" : "Preview"}
              </button>
            </div>
            {showPreview ? (
              <div className="border border-border rounded-lg p-4 min-h-[120px] bg-background">
                <MathPreview text={content} />
              </div>
            ) : (
              <textarea
                id="lessonContent"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={!isOwner}
                rows={6}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 resize-y"
                placeholder={"Explain the concept here...\n\nUse $x^2$ for inline math and $$\\frac{a}{b}$$ for display math"}
              />
            )}
          </div>

          {isOwner && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm disabled:opacity-50 cursor-pointer"
              >
                {saving ? "Saving..." : "Save Lesson"}
              </button>
              {message && (
                <span className="text-sm text-muted-foreground">{message}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Problems */}
      <div className="border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Problems ({problems.length})
          </h2>
          {isOwner && (
            <button
              onClick={() => setAddingProblem(true)}
              className="text-sm px-3 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              + Add Problem
            </button>
          )}
        </div>

        {problems.length === 0 && !addingProblem ? (
          <p className="text-sm text-muted-foreground">
            No problems yet. Add your first problem to make this lesson interactive.
          </p>
        ) : (
          <div className="space-y-3">
            {problems.map((problem, index) => (
              <div
                key={problem.id}
                draggable={isOwner}
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={`border border-border rounded-lg p-4 transition-colors ${
                  draggedIndex === index ? "opacity-50 border-primary" : ""
                } ${isOwner ? "cursor-grab active:cursor-grabbing" : ""}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {isOwner && (
                        <span className="text-muted-foreground text-xs select-none">
                          &#x2630;
                        </span>
                      )}
                      <h3 className="font-medium text-sm">
                        {index + 1}. {problem.title}
                      </h3>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-muted-foreground">
                        Difficulty {problem.difficulty}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {problem.kcs.map(({ kc }) => (
                        <span
                          key={kc.id}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        >
                          {kc.name}
                        </span>
                      ))}
                      <span className="text-xs text-muted-foreground">
                        {((problem.content as Record<string, unknown>).steps as unknown[])?.length ?? 0} step(s)
                      </span>
                    </div>
                  </div>
                  {isOwner && (
                    <button
                      onClick={() => handleDeleteProblem(problem.id)}
                      className="text-xs text-red-500 hover:text-red-700 ml-2"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Problem Form */}
        {addingProblem && (
          <div className="mt-4 border border-dashed border-border rounded-lg p-4">
            <ProblemEditor
              lessonId={lesson.id}
              availableKCs={availableKCs}
              onSaved={(newProblem) => {
                setProblems((prev) => [...prev, newProblem]);
                setAddingProblem(false);
              }}
              onCancel={() => setAddingProblem(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
