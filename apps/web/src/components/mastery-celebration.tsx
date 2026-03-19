"use client";

import { useEffect, useRef, useCallback } from "react";
import { trapFocus, announce } from "@/lib/a11y";

interface MasteryCelebrationProps {
  kcName: string;
  pMastery: number;
  onDismiss: () => void;
}

/**
 * Full-screen overlay celebrating when a student masters a KC.
 * CSS-only confetti animation, focus-trapped, respects prefers-reduced-motion.
 */
export function MasteryCelebration({
  kcName,
  pMastery,
  onDismiss,
}: MasteryCelebrationProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    announce(`Congratulations! You mastered ${kcName}!`, "assertive");

    // Trap focus inside the modal
    if (overlayRef.current) {
      const cleanup = trapFocus(overlayRef.current, onDismiss);
      return cleanup;
    }
  }, [kcName, onDismiss]);

  // Focus the dismiss button on mount
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onDismiss();
    },
    [onDismiss]
  );

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={`Mastery celebration for ${kcName}`}
    >
      {/* Confetti particles — CSS only, hidden from screen readers */}
      <div className="confetti-container" aria-hidden="true">
        {Array.from({ length: 20 }, (_, i) => (
          <div
            key={i}
            className="confetti-particle"
            style={{
              left: `${5 + Math.random() * 90}%`,
              animationDelay: `${Math.random() * 0.8}s`,
              animationDuration: `${1.5 + Math.random() * 1.5}s`,
              backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              width: `${6 + Math.random() * 6}px`,
              height: `${6 + Math.random() * 6}px`,
            }}
          />
        ))}
      </div>

      {/* Card */}
      <div className="relative bg-background border border-border rounded-2xl p-8 max-w-sm w-full mx-4 text-center animate-pop shadow-lg">
        <div className="text-5xl mb-4" aria-hidden="true">
          <span className="inline-block animate-pop" style={{ animationDelay: "0.1s" }}>
            *
          </span>
        </div>

        <h2 className="text-xl font-bold mb-2">Skill Mastered!</h2>

        <p className="text-lg font-medium text-primary mb-1">{kcName}</p>

        <p className="text-muted-foreground text-sm mb-6">
          {Math.round(pMastery * 100)}% mastery achieved
        </p>

        <button
          ref={buttonRef}
          onClick={onDismiss}
          className="px-6 py-2.5 min-h-[44px] bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium cursor-pointer"
        >
          Keep going!
        </button>
      </div>
    </div>
  );
}

const CONFETTI_COLORS = [
  "#f59e0b", // amber
  "#3b82f6", // blue
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
];
