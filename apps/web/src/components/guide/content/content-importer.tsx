"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ValidationError {
  path: string;
  message: string;
}

interface ImportResult {
  success: boolean;
  courseId: string;
  courseTitle: string;
  stats: {
    kcsCreated: number;
    kcsReused: number;
    modules: number;
    lessons: number;
    problems: number;
  };
}

export function ContentImporter() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    title: string;
    subject: string;
    gradeLevels: number[];
    kcs: number;
    modules: number;
    lessons: number;
    problems: number;
  } | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setValidationErrors([]);
    setResult(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setFileContent(text);

      try {
        const json = JSON.parse(text);
        // Generate preview
        let totalProblems = 0;
        let totalLessons = 0;
        for (const mod of json.modules ?? []) {
          for (const lesson of mod.lessons ?? []) {
            totalLessons++;
            totalProblems += lesson.problems?.length ?? 0;
          }
        }
        setPreview({
          title: json.title ?? "(untitled)",
          subject: json.subject ?? "(unknown)",
          gradeLevels: json.gradeLevels ?? [],
          kcs: json.knowledgeComponents?.length ?? 0,
          modules: json.modules?.length ?? 0,
          lessons: totalLessons,
          problems: totalProblems,
        });
      } catch {
        setError("Invalid JSON file. Please check the file format.");
        setPreview(null);
      }
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!fileContent) return;
    setImporting(true);
    setError(null);
    setValidationErrors([]);

    try {
      const res = await fetch("/api/guide/content/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: fileContent,
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.details && Array.isArray(data.details)) {
          setValidationErrors(data.details);
          setError(data.summary ?? "Validation failed");
        } else {
          setError(data.error ?? "Import failed");
        }
        return;
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  if (result) {
    return (
      <div className="border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-3">
          Import Successful!
        </h2>
        <p className="text-sm text-green-700 dark:text-green-300 mb-4">
          Course &ldquo;{result.courseTitle}&rdquo; has been imported as a draft.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <StatBox label="KCs Created" value={result.stats.kcsCreated} />
          <StatBox label="KCs Reused" value={result.stats.kcsReused} />
          <StatBox label="Modules" value={result.stats.modules} />
          <StatBox label="Lessons" value={result.stats.lessons} />
          <StatBox label="Problems" value={result.stats.problems} />
        </div>
        <div className="flex gap-3">
          <Link
            href={`/guide/content/courses/${result.courseId}/edit`}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm"
          >
            Edit Course
          </Link>
          <button
            onClick={() => {
              setResult(null);
              setFileContent(null);
              setFileName(null);
              setPreview(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
            className="px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors text-sm"
          >
            Import Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* File Upload */}
      <div className="border border-dashed border-border rounded-lg p-8 text-center">
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          className="hidden"
          id="file-upload"
        />
        <label
          htmlFor="file-upload"
          className="cursor-pointer"
        >
          <div className="text-3xl mb-2">&uarr;</div>
          <p className="text-sm font-medium mb-1">
            {fileName ?? "Click to select a JSON file"}
          </p>
          <p className="text-xs text-muted-foreground">
            Accepts course JSON in Primer/OATutor format
          </p>
        </label>
      </div>

      {/* Preview */}
      {preview && (
        <div className="border border-border rounded-lg p-5">
          <h2 className="font-semibold mb-3">Preview</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <div>
              <div className="text-xs text-muted-foreground">Title</div>
              <div className="text-sm font-medium">{preview.title}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Subject</div>
              <div className="text-sm">{preview.subject}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Grade Levels</div>
              <div className="text-sm">{preview.gradeLevels.join(", ")}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatBox label="Knowledge Components" value={preview.kcs} />
            <StatBox label="Modules" value={preview.modules} />
            <StatBox label="Lessons" value={preview.lessons} />
            <StatBox label="Problems" value={preview.problems} />
          </div>

          <button
            onClick={handleImport}
            disabled={importing}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm disabled:opacity-50 cursor-pointer"
          >
            {importing ? "Importing..." : "Import Course"}
          </button>
        </div>
      )}

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 rounded-lg p-5">
          <h2 className="font-semibold text-red-800 dark:text-red-200 mb-3">
            Validation Errors ({validationErrors.length})
          </h2>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {validationErrors.map((err, i) => (
              <div key={i} className="text-sm text-red-700 dark:text-red-300">
                <span className="font-mono text-xs">[{err.path}]</span> {err.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* General Error */}
      {error && validationErrors.length === 0 && (
        <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
      )}

      {/* Format Help */}
      <div className="border border-border rounded-lg p-5">
        <h2 className="font-semibold mb-3">Expected Format</h2>
        <pre className="text-xs bg-accent/50 rounded p-3 overflow-x-auto">
{`{
  "id": "course-id",
  "title": "Course Title",
  "subject": "MATH",
  "gradeLevels": [5],
  "description": "...",
  "license": "...",
  "knowledgeComponents": [
    { "id": "kc_id", "name": "...", "subject": "MATH",
      "gradeLevels": [5], "prerequisites": [], "description": "..." }
  ],
  "modules": [
    { "id": "mod_id", "title": "...", "lessons": [
      { "id": "lesson_id", "title": "...", "problems": [
        { "id": "prob_id", "title": "...", "difficulty": 1,
          "steps": [
            { "id": "step_1", "prompt": "...",
              "correctAnswer": "...", "kcs": ["kc_id"],
              "hints": [{ "type": "scaffold", "content": "..." }] }
          ] }
      ] }
    ] }
  ]
}`}
        </pre>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border rounded p-2 text-center">
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
