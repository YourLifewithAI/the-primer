/**
 * Accessibility utilities for The Primer.
 *
 * - Screen reader announcements via aria-live region
 * - Focus management helpers
 * - Keyboard trap for modals/dropdowns
 */

// ── Screen Reader Announcements ──────────────────────────────

/**
 * Returns the appropriate aria-live region element for the given priority.
 * Uses the SSR-rendered regions from AriaLiveRegion component.
 * Falls back to creating a region dynamically if the component isn't mounted.
 */
function getLiveRegion(priority: "polite" | "assertive"): HTMLElement {
  const id =
    priority === "assertive"
      ? "a11y-live-region-assertive"
      : "a11y-live-region";

  const existing = document.getElementById(id);
  if (existing) return existing;

  // Fallback: create dynamically if AriaLiveRegion component isn't mounted
  const el = document.createElement("div");
  el.id = id;
  el.setAttribute("aria-live", priority);
  el.setAttribute("aria-atomic", "true");
  el.setAttribute("role", priority === "assertive" ? "alert" : "status");
  el.className = "sr-only";
  document.body.appendChild(el);
  return el;
}

/**
 * Announce a message to screen readers via aria-live region.
 * Uses separate regions for polite and assertive announcements,
 * which is more reliable across screen readers than mutating aria-live.
 * @param message - The text to announce
 * @param priority - "polite" waits for current speech; "assertive" interrupts
 */
export function announce(
  message: string,
  priority: "polite" | "assertive" = "polite",
): void {
  const region = getLiveRegion(priority);
  // Clear first so repeated identical messages still trigger
  region.textContent = "";
  // Force reflow before setting new text
  void region.offsetHeight;
  region.textContent = message;
}

// ── Focus Management ─────────────────────────────────────────

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(", ");

/**
 * Returns all focusable elements within a container.
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/**
 * Moves focus to the first focusable element inside a container.
 */
export function focusFirst(container: HTMLElement): void {
  const elements = getFocusableElements(container);
  elements[0]?.focus();
}

/**
 * Restores focus to a previously-focused element.
 * Useful when closing a modal/dropdown.
 */
export function restoreFocus(element: HTMLElement | null): void {
  if (element && typeof element.focus === "function") {
    element.focus();
  }
}

// ── Keyboard Trap ────────────────────────────────────────────

/**
 * Creates a keyboard focus trap within a container.
 * Tab and Shift+Tab cycle through focusable elements inside the container.
 * Escape calls the onEscape callback (typically to close a modal).
 *
 * Returns a cleanup function that removes the event listener.
 *
 * Usage:
 *   const cleanup = trapFocus(modalRef.current, () => setOpen(false));
 *   // ...later, on unmount or close:
 *   cleanup();
 */
export function trapFocus(
  container: HTMLElement,
  onEscape?: () => void,
): () => void {
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && onEscape) {
      e.preventDefault();
      onEscape();
      return;
    }

    if (e.key !== "Tab") return;

    const focusable = getFocusableElements(container);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      // Shift+Tab: wrap from first to last
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      // Tab: wrap from last to first
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  container.addEventListener("keydown", handleKeyDown);
  return () => container.removeEventListener("keydown", handleKeyDown);
}
