"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="text-sm px-4 py-2 rounded-lg border border-border hover:border-foreground/20 transition-colors cursor-pointer"
    >
      Print / Export
    </button>
  );
}
