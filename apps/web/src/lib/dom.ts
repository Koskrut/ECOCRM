/**
 * Returns true if the user has selected text (e.g. by dragging).
 * Use in click handlers to avoid opening/navigating when the user intended to select text.
 */
export function isTextSelected(): boolean {
  return Boolean(window.getSelection()?.toString().trim());
}
