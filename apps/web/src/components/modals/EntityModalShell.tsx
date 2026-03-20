"use client";

import { useEffect } from "react";

export type EntityModalShellProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  headerActions?: React.ReactNode;
  /** Renders directly under the header (e.g. Main | Orders | Delivery profiles tabs). */
  tabsUnderHeader?: React.ReactNode;
  left: React.ReactNode;
  /** When null/undefined, only left column is shown (full width). */
  right?: React.ReactNode | null;
  footer?: React.ReactNode | null;
  canClose: boolean;
  onClose: () => void;
  /** If provided, ESC first calls this. Return true if a nested state was closed (then we do not call onClose). */
  onEscape?: () => boolean;
};

/**
 * Entity modal standard: header (title + subtitle + actions), 2-column body (left 7/12, right 5/12), optional footer.
 * Overlay click -> onClose only if canClose.
 * ESC -> onEscape?.() first; if it returns true, stop; else if canClose call onClose.
 * Max height 90vh, body scrolls, left and right columns scroll independently.
 */
export function EntityModalShell({
  title,
  subtitle,
  headerActions,
  tabsUnderHeader,
  left,
  right,
  footer,
  canClose,
  onClose,
  onEscape,
}: EntityModalShellProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (onEscape?.()) return;
      if (canClose) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canClose, onClose, onEscape]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm"
      role="presentation"
      onClick={() => canClose && onClose()}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between overflow-visible border-b border-zinc-200 px-5 py-4">
          <div className="min-w-0 pr-2">
            <div className="text-base font-semibold text-zinc-900">{title}</div>
            {subtitle != null ? (
              <div className="mt-0.5 text-xs text-zinc-500">{subtitle}</div>
            ) : null}
          </div>
          <div className="relative flex shrink-0 items-center gap-2 overflow-visible">
            {headerActions}
            <button
              type="button"
              onClick={() => canClose && onClose()}
              disabled={!canClose}
              className="rounded-md border border-zinc-200 px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              ✕
            </button>
          </div>
        </div>

        {tabsUnderHeader != null ? (
          <div className="shrink-0 border-b border-zinc-200 px-5">{tabsUnderHeader}</div>
        ) : null}

        {/* Body: on narrow viewports single scroll column (left then right). On xl: grid 7+5 cols, columns scroll independently. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-auto xl:grid xl:grid-cols-12 xl:gap-0 xl:overflow-visible">
          <div
            className={`min-h-0 shrink-0 p-5 xl:min-h-0 xl:overflow-auto ${right != null ? "xl:col-span-7" : "xl:col-span-12"}`}
          >
            {left}
          </div>
          {right != null ? (
            <div className="min-h-0 shrink-0 border-t border-zinc-200 p-5 max-xl:w-full xl:min-h-0 xl:col-span-5 xl:border-t-0 xl:border-l xl:overflow-auto">
              {right}
            </div>
          ) : null}
        </div>

        {footer != null ? (
          <div className="shrink-0 border-t border-zinc-200 bg-zinc-50 px-5 py-3">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
