"use client";

import { useEffect, useRef } from "react";

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
  const containerRef = useRef<HTMLDivElement | null>(null);

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
        ref={containerRef}
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div className="min-w-0 pr-2">
            <div className="text-base font-semibold text-zinc-900">{title}</div>
            {subtitle != null ? (
              <div className="mt-0.5 text-sm text-zinc-500">{subtitle}</div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
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

        {/* Body: left 7 cols, right 5 cols (or left full width when no right) */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-12">
          <div
            className={`min-h-0 overflow-auto p-5 ${right != null ? "lg:col-span-7" : "lg:col-span-12"}`}
          >
            {left}
          </div>
          {right != null ? (
            <div className="min-h-0 border-t border-zinc-200 overflow-auto p-5 lg:col-span-5 lg:border-t-0 lg:border-l">
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
