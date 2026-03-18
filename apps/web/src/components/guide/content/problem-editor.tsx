"use client";

import { useState } from "react";
import { MathPreview } from "./math-preview";

interface KCOption {
  id: string;
  name: string;
  subject: string;
  gradeLevel: number[];
}

interface StepInput {
  id: string;
  prompt: string;
  correctAnswer: string;
  hints: Array<{ type: "scaffold" | "more_specific" | "bottom_out"; content: string }>;
  kcs: string[];
  explanation: string;
}

interface SavedProblem {
  id: string;
  title: string;
  difficulty: number;
  content: Record<string, unknown>;
  orderIndex: number;
  kcs: Array<{ kc: { id: string; name: string; subject: string; gradeLevel: number[] } }>;
}

export function ProblemEditor({
  lessonId,
  availableKCs,
  onSaved,
  onCancel,
}: {
  lessonId: string;
  availableKCs: KCOption[];
  onSaved: (problem: SavedProblem) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState(1);
  const [context, setContext] = useState("");
  const [steps, setSteps] = useState<StepInput[]>([
    { id: `step_1`, prompt: "", correctAnswer: "", hints: [{ type: "scaffold", content: "" }], kcs: [], explanation: "" },
  ]);
  const [selectedKCs, setSelectedKCs] = useState<string[]>([]);
  const [kcSearch, setKcSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewStep, setPreviewStep] = useState<number | null>(null);

  const filteredKCs = availableKCs.filter(
    (kc) =>
      !selectedKCs.includes(kc.id) &&
      (kc.name.toLowerCase().includes(kcSearch.toLowerCase()) ||
        kc.id.toLowerCase().includes(kcSearch.toLowerCase()))
  );

  function addStep() {
    setSteps((prev) => [
      ...prev,
      {
        id: `step_${prev.length + 1}`,
        prompt: "",
        correctAnswer: "",
        hints: [{ type: "scaffold" as const, content: "" }],
        kcs: selectedKCs.slice(), // inherit parent KCs
        explanation: "",
      },
    ]);
  }

  function removeStep(index: number) {
    if (steps.length <= 1) return;
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  function updateStep(index: number, updates: Partial<StepInput>) {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...updates } : s))
    );
  }

  function addHint(stepIndex: number) {
    setSteps((prev) =>
      prev.map((s, i) => {
        if (i !== stepIndex) return s;
        const nextType =
          s.hints.length === 0
            ? "scaffold"
            : s.hints.length === 1
            ? "more_specific"
            : "bottom_out";
        return {
          ...s,
          hints: [...s.hints, { type: nextType as "scaffold" | "more_specific" | "bottom_out", content: "" }],
        };
      })
    );
  }

  function updateHint(stepIndex: number, hintIndex: number, content: string) {
    setSteps((prev) =>
      prev.map((s, i) => {
        if (i !== stepIndex) return s;
        return {
          ...s,
          hints: s.hints.map((h, j) => (j === hintIndex ? { ...h, content } : h)),
        };
      })
    );
  }

  function removeHint(stepIndex: number, hintIndex: number) {
    setSteps((prev) =>
      prev.map((s, i) => {
        if (i !== stepIndex) return s;
        return { ...s, hints: s.hints.filter((_, j) => j !== hintIndex) };
      })
    );
  }

  async function handleSave() {
    if (!title.trim()) {
      setError("Problem title is required");
      return;
    }
    if (steps.some((s) => !s.prompt.trim() || !s.correctAnswer.trim())) {
      setError("Each step needs a prompt and correct answer");
      return;
    }
    if (steps.some((s) => s.hints.length === 0)) {
      setError("Each step needs at least one hint");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const stepsPayload = steps.map((s, i) => ({
        id: `step_${i + 1}`,
        prompt: s.prompt,
        correctAnswer: s.correctAnswer,
        kcs: s.kcs.length > 0 ? s.kcs : selectedKCs,
        hints: s.hints.filter((h) => h.content.trim()),
        explanation: s.explanation || undefined,
      }));

      const res = await fetch(`/api/guide/content/lessons/${lessonId}/problems`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          difficulty,
          context: context || undefined,
          steps: stepsPayload,
          kcIds: selectedKCs,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save problem");
      }

      const data = await res.json();
      onSaved(data.problem);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <h3 className="font-semibold">New Problem</h3>

      {/* Title & Difficulty */}
      <div className="grid grid-cols-[1fr_120px] gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Problem Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Identify the Value of a Digit"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Difficulty</label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(parseInt(e.target.value))}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>
                {d} - {["Easy", "Moderate", "Medium", "Hard", "Expert"][d - 1]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Context */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Context / Setup Text (optional, supports KaTeX)
        </label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="e.g., Look at the number $7.293$."
          rows={2}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary resize-y"
        />
        {context && (
          <div className="mt-1 p-2 bg-accent/30 rounded text-sm">
            <MathPreview text={context} />
          </div>
        )}
      </div>

      {/* KC Assignment */}
      <div>
        <label className="block text-sm font-medium mb-1">Knowledge Components</label>
        <div className="flex flex-wrap gap-1 mb-2">
          {selectedKCs.map((kcId) => {
            const kc = availableKCs.find((k) => k.id === kcId);
            return (
              <span
                key={kcId}
                className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 flex items-center gap-1"
              >
                {kc?.name ?? kcId}
                <button
                  type="button"
                  onClick={() =>
                    setSelectedKCs((prev) => prev.filter((id) => id !== kcId))
                  }
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
          value={kcSearch}
          onChange={(e) => setKcSearch(e.target.value)}
          placeholder="Search KCs..."
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {kcSearch && filteredKCs.length > 0 && (
          <div className="mt-1 border border-border rounded-lg max-h-32 overflow-y-auto">
            {filteredKCs.slice(0, 10).map((kc) => (
              <button
                key={kc.id}
                type="button"
                onClick={() => {
                  setSelectedKCs((prev) => [...prev, kc.id]);
                  setKcSearch("");
                }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
              >
                {kc.name}{" "}
                <span className="text-xs text-muted-foreground">
                  ({kc.subject}, Grade {kc.gradeLevel.join(",")})
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Steps */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium">Steps *</label>
          <button
            type="button"
            onClick={addStep}
            className="text-xs text-primary hover:underline"
          >
            + Add Step
          </button>
        </div>

        <div className="space-y-4">
          {steps.map((step, stepIndex) => (
            <div
              key={stepIndex}
              className="border border-border rounded-lg p-4 bg-background"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">Step {stepIndex + 1}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewStep(previewStep === stepIndex ? null : stepIndex)
                    }
                    className="text-xs text-primary hover:underline"
                  >
                    {previewStep === stepIndex ? "Edit" : "Preview"}
                  </button>
                  {steps.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeStep(stepIndex)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {previewStep === stepIndex ? (
                <div className="space-y-2">
                  <div className="p-2 bg-accent/30 rounded">
                    <p className="text-xs text-muted-foreground mb-1">Prompt:</p>
                    <MathPreview text={step.prompt} />
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Answer: </span>
                    <MathPreview text={step.correctAnswer} />
                  </div>
                  {step.hints.map((hint, hi) => (
                    <div key={hi} className="text-sm ml-4">
                      <span className="text-muted-foreground">Hint ({hint.type}): </span>
                      <MathPreview text={hint.content} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Prompt */}
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">
                      Prompt (supports $math$) *
                    </label>
                    <textarea
                      value={step.prompt}
                      onChange={(e) =>
                        updateStep(stepIndex, { prompt: e.target.value })
                      }
                      placeholder="What is the value of the digit $9$ in the number $7.293$?"
                      rows={2}
                      className="w-full rounded border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                    />
                  </div>

                  {/* Correct Answer */}
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">
                      Correct Answer *
                    </label>
                    <input
                      type="text"
                      value={step.correctAnswer}
                      onChange={(e) =>
                        updateStep(stepIndex, { correctAnswer: e.target.value })
                      }
                      placeholder="0.09"
                      className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  {/* Explanation */}
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">
                      Explanation (shown after correct answer, optional)
                    </label>
                    <input
                      type="text"
                      value={step.explanation}
                      onChange={(e) =>
                        updateStep(stepIndex, { explanation: e.target.value })
                      }
                      placeholder="The digit 9 is in the hundredths place..."
                      className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  {/* Hints */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-muted-foreground">
                        Hints (progressive: scaffold &rarr; more specific &rarr; bottom out)
                      </label>
                      <button
                        type="button"
                        onClick={() => addHint(stepIndex)}
                        className="text-xs text-primary hover:underline"
                      >
                        + Hint
                      </button>
                    </div>
                    <div className="space-y-2">
                      {step.hints.map((hint, hintIndex) => (
                        <div key={hintIndex} className="flex items-start gap-2">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-muted-foreground mt-2 whitespace-nowrap">
                            {hint.type}
                          </span>
                          <input
                            type="text"
                            value={hint.content}
                            onChange={(e) =>
                              updateHint(stepIndex, hintIndex, e.target.value)
                            }
                            placeholder="Hint text (supports $math$)"
                            className="flex-1 rounded border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                          {step.hints.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeHint(stepIndex, hintIndex)}
                              className="text-xs text-red-500 hover:text-red-700 mt-2"
                            >
                              &times;
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm disabled:opacity-50 cursor-pointer"
        >
          {saving ? "Saving..." : "Save Problem"}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
