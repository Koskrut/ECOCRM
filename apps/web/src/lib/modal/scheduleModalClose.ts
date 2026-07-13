/** Defer modal close to the next tick so the overlay click event finishes before unmount (prevents click-through to parent modals). */
export function scheduleModalClose(fn: () => void) {
  queueMicrotask(fn);
}
