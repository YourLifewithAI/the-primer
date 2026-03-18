"use client";

import { useState } from "react";
import Link from "next/link";

interface PrerequisiteData {
  prerequisite: { id: string; name: string };
}

interface KCData {
  id: string;
  name: string;
  description: string | null;
  subject: string;
  gradeLevel: number[];
  prerequisites: PrerequisiteData[];
  _count: { problemKCs: number };
}

const SUBJECTS = [
  { value: "", label: "All Subjects" },
  { value: "MATH", label: "Mathematics" },
  { value: "SCIENCE", label: "Science" },
  { value: "ELA", label: "English Language Arts" },
  { value: "SOCIAL_STUDIES", label: "Social Studies" },
];

export function KCManager({ initialKCs }: { initialKCs: KCData[] }) {
  const [kcs, setKcs] = useState(initialKCs);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newSubject, setNewSubject] = useState("MATH");
  const [newGrades, setNewGrades] = useState<number[]>([]);
  const [newPrereqs, setNewPrereqs] = useState<string[]>([]);
  const [prereqSearch, setPrereqSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = kcs.filter((kc) => {
    if (search && !kc.name.toLowerCase().includes(search.toLowerCase()) &&
        !(kc.description?.toLowerCase().includes(search.toLowerCase()))) {
      return false;
    }
    if (subjectFilter && kc.subject !== subjectFilter) return false;
    if (gradeFilter && !kc.gradeLevel.includes(parseInt(gradeFilter))) return false;
    return true;
  });

  const prereqOptions = kcs.filter(
    (kc) =>
      !newPrereqs.includes(kc.id) &&
      kc.name.toLowerCase().includes(prereqSearch.toLowerCase())
  );

  async function handleCreate() {
    if (!newName.trim()) {
      setError("Name is required");
      return;
    }
    if (!newGrades.length) {
      setError("At least one grade level is required");
      return;
    }
    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/guide/content/kcs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          description: newDescription || undefined,
          subject: newSubject,
          gradeLevels: newGrades,
          prerequisiteIds: newPrereqs.length > 0 ? newPrereqs : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create KC");
      }
      const data = await res.json();
      setKcs((prev) => [...prev, { ...data.kc, _count: { problemKCs: 0 } }]);
      setShowCreate(false);
      setNewName("");
      setNewDescription("");
      setNewGrades([]);
      setNewPrereqs([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
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
          <h1 className="text-2xl font-bold">Knowledge Components</h1>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {showCreate ? "Cancel" : "New KC"}
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="border border-border rounded-lg p-5 mb-6">
          <h2 className="font-semibold mb-4">Create Knowledge Component</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Distributive Property"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="What does mastery of this KC mean?"
                rows={2}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-y"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Subject *</label>
                <select
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {SUBJECTS.slice(1).map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Grade Levels *</label>
                <div className="flex flex-wrap gap-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() =>
                        setNewGrades((prev) =>
                          prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g].sort()
                        )
                      }
                      className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                        newGrades.includes(g)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border hover:bg-accent"
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Prerequisites */}
            <div>
              <label className="block text-sm font-medium mb-1">Prerequisite KCs</label>
              <div className="flex flex-wrap gap-1 mb-2">
                {newPrereqs.map((id) => {
                  const kc = kcs.find((k) => k.id === id);
                  return (
                    <span
                      key={id}
                      className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 flex items-center gap-1"
                    >
                      {kc?.name ?? id}
                      <button
                        type="button"
                        onClick={() => setNewPrereqs((prev) => prev.filter((p) => p !== id))}
                        className="hover:text-red-500"
                      >
                        &times;
                      </button>
                    </span>
                  );
                })}
              </div>
              <input
                type="text"
                value={prereqSearch}
                onChange={(e) => setPrereqSearch(e.target.value)}
                placeholder="Search prerequisites..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {prereqSearch && prereqOptions.length > 0 && (
                <div className="mt-1 border border-border rounded-lg max-h-32 overflow-y-auto">
                  {prereqOptions.slice(0, 8).map((kc) => (
                    <button
                      key={kc.id}
                      type="button"
                      onClick={() => {
                        setNewPrereqs((prev) => [...prev, kc.id]);
                        setPrereqSearch("");
                      }}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                    >
                      {kc.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
            )}

            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm disabled:opacity-50 cursor-pointer"
            >
              {creating ? "Creating..." : "Create KC"}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search KCs..."
          className="flex-1 min-w-[200px] rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {SUBJECTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <select
          value={gradeFilter}
          onChange={(e) => setGradeFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">All Grades</option>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((g) => (
            <option key={g} value={g}>Grade {g}</option>
          ))}
        </select>
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        {filtered.length} of {kcs.length} Knowledge Components
      </p>

      {/* KC List */}
      <div className="space-y-2">
        {filtered.map((kc) => (
          <div
            key={kc.id}
            className="border border-border rounded-lg p-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium text-sm">{kc.name}</h3>
                {kc.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {kc.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 ml-2">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-muted-foreground">
                  {kc.subject}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-muted-foreground">
                  Grade {kc.gradeLevel.join(", ")}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {kc._count.problemKCs} problem{kc._count.problemKCs !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
            {kc.prerequisites.length > 0 && (
              <div className="flex items-center gap-1 mt-2">
                <span className="text-[10px] text-muted-foreground">Prereqs:</span>
                {kc.prerequisites.map((p) => (
                  <span
                    key={p.prerequisite.id}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                  >
                    {p.prerequisite.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
