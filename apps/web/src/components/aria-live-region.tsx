"use client";

/**
 * Persistent aria-live region rendered at the bottom of the body.
 * The `announce()` helper in `@/lib/a11y` targets #a11y-live-region,
 * but this component serves as the SSR-safe mounting point.
 */
export function AriaLiveRegion() {
  return (
    <>
      {/* Polite announcements (mastery updates, notification counts) */}
      <div
        id="a11y-live-region"
        aria-live="polite"
        aria-atomic="true"
        role="status"
        className="sr-only"
      />
      {/* Assertive announcements (correct/incorrect, errors) */}
      <div
        id="a11y-live-region-assertive"
        aria-live="assertive"
        aria-atomic="true"
        role="alert"
        className="sr-only"
      />
    </>
  );
}
