"use client";

import { useMemo } from "react";

/**
 * Renders text with inline KaTeX math ($...$) and display math ($$...$$).
 * Uses a simple regex-based approach to split text and render math.
 *
 * This is a lightweight preview — it renders math notation as styled spans.
 * For production-quality rendering, the full KaTeX library is used in the
 * student-facing problem-viewer component.
 */
export function MathPreview({ text }: { text: string }) {
  const rendered = useMemo(() => {
    if (!text) return null;

    // Split on display math ($$...$$) and inline math ($...$)
    // Process display math first, then inline within non-math segments
    const parts: Array<{ type: "text" | "display-math" | "inline-math"; content: string }> = [];

    // Split on display math blocks
    const displayParts = text.split(/(\$\$[\s\S]*?\$\$)/);
    for (const part of displayParts) {
      if (part.startsWith("$$") && part.endsWith("$$")) {
        parts.push({ type: "display-math", content: part.slice(2, -2) });
      } else {
        // Split on inline math within text segments
        const inlineParts = part.split(/(\$[^$\n]+?\$)/);
        for (const inlinePart of inlineParts) {
          if (inlinePart.startsWith("$") && inlinePart.endsWith("$") && inlinePart.length > 2) {
            parts.push({ type: "inline-math", content: inlinePart.slice(1, -1) });
          } else if (inlinePart) {
            parts.push({ type: "text", content: inlinePart });
          }
        }
      }
    }

    return parts.map((part, i) => {
      if (part.type === "display-math") {
        return (
          <div key={i} className="my-2 text-center font-mono text-sm bg-accent/50 rounded px-3 py-2">
            {part.content}
          </div>
        );
      }
      if (part.type === "inline-math") {
        return (
          <code key={i} className="font-mono text-sm bg-accent/50 rounded px-1">
            {part.content}
          </code>
        );
      }
      // Text: handle newlines
      return (
        <span key={i}>
          {part.content.split("\n").map((line, j, arr) => (
            <span key={j}>
              {line}
              {j < arr.length - 1 && <br />}
            </span>
          ))}
        </span>
      );
    });
  }, [text]);

  if (!text) {
    return <p className="text-muted-foreground italic">No content yet</p>;
  }

  return <div className="prose prose-sm dark:prose-invert max-w-none">{rendered}</div>;
}
