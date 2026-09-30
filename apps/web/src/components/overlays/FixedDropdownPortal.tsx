"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

export type FixedDropdownRect = {
  top: number;
  left: number;
  width: number;
  maxHeightPx: number;
};

function parseCssLengthToPx(value: string, fallback: number): number {
  const trimmed = value.trim();
  if (trimmed.endsWith("rem")) {
    const n = Number.parseFloat(trimmed);
    if (!Number.isFinite(n)) return fallback;
    const rem =
      typeof window !== "undefined"
        ? Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
        : 16;
    return n * rem;
  }
  if (trimmed.endsWith("dvh") || trimmed.endsWith("vh")) {
    const n = Number.parseFloat(trimmed);
    if (!Number.isFinite(n)) return fallback;
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const h = vv?.height ?? (typeof window !== "undefined" ? window.innerHeight : 800);
    return (n / 100) * h;
  }
  if (trimmed.endsWith("px")) {
    const n = Number.parseFloat(trimmed);
    return Number.isFinite(n) ? n : fallback;
  }
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) ? n : fallback;
}

export function useFixedDropdownRect(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  maxHeight: string,
  minWidth: number,
) {
  const [rect, setRect] = useState<FixedDropdownRect | null>(null);

  const updateRect = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const viewTop = vv?.offsetTop ?? 0;
    const viewHeight = vv?.height ?? window.innerHeight;
    const viewLeft = vv?.offsetLeft ?? 0;
    const viewWidth = vv?.width ?? window.innerWidth;
    const viewBottom = viewTop + viewHeight;

    const preferredMax = parseCssLengthToPx(maxHeight, 224);
    const gap = 4;
    const edgePad = 8;
    const spaceBelow = Math.max(0, viewBottom - box.bottom - edgePad);
    const spaceAbove = Math.max(0, box.top - viewTop - edgePad);
    const openUp = spaceBelow < Math.min(preferredMax, 140) && spaceAbove > spaceBelow;
    const maxHeightPx = Math.max(
      96,
      Math.min(preferredMax, openUp ? spaceAbove : spaceBelow || preferredMax),
    );

    const width = Math.min(Math.max(box.width, minWidth), Math.max(120, viewWidth - edgePad * 2));
    let left = box.left;
    left = Math.min(Math.max(left, viewLeft + edgePad), viewLeft + viewWidth - width - edgePad);

    const top = openUp ? Math.max(viewTop + edgePad, box.top - gap - maxHeightPx) : box.bottom + gap;

    setRect({ top, left, width, maxHeightPx });
  }, [anchorRef, maxHeight, minWidth]);

  useEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        updateRect();
      });
    };
    updateRect();
    window.addEventListener("resize", schedule);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", schedule);
    // Only follow visualViewport scroll (keyboard), not every scrollable ancestor —
    // continuous document scroll updates make the panel "fly".
    vv?.addEventListener("scroll", schedule);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      vv?.removeEventListener("resize", schedule);
      vv?.removeEventListener("scroll", schedule);
    };
  }, [open, updateRect]);

  return rect;
}

export function useDismissOnOutsidePointerDown(
  open: boolean,
  onClose: () => void,
  anchorRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, onClose, anchorRef, panelRef]);
}

type FixedDropdownPortalProps = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  panelRef?: RefObject<HTMLDivElement | null>;
  minWidth?: number;
  /** CSS length preferred max height. Default 14rem. Clamped to visual viewport. */
  maxHeight?: string;
  className?: string;
  /**
   * fixed = portal to body (default; escapes overflow:hidden/auto ancestors such as EntitySection / modal body).
   * absolute = in-place under a relative parent (only when the parent does not clip overflow).
   */
  placement?: "fixed" | "absolute";
  children: ReactNode;
};

const FIXED_CLASS =
  "fixed z-[100] overflow-auto rounded-md border border-zinc-200 bg-white shadow-lg";

const ABSOLUTE_CLASS =
  "absolute left-0 right-0 top-full z-[100] mt-1 overflow-auto rounded-md border border-zinc-200 bg-white shadow-lg";

/** Drop positioning utilities from a custom className; base classes supply layout. */
function mergePanelClass(base: string, className?: string): string {
  if (!className) return base;
  const stripped = className
    .replace(/\bfixed\b/g, "")
    .replace(/\babsolute\b/g, "")
    .replace(/\bleft-0\b/g, "")
    .replace(/\bright-0\b/g, "")
    .replace(/\btop-full\b/g, "")
    .replace(/\bmt-1\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped ? `${base} ${stripped}` : base;
}

export function FixedDropdownPortal({
  open,
  anchorRef,
  panelRef: panelRefProp,
  minWidth = 240,
  maxHeight = "14rem",
  className,
  placement = "fixed",
  children,
}: FixedDropdownPortalProps) {
  const localPanelRef = useRef<HTMLDivElement | null>(null);
  const panelRef = panelRefProp ?? localPanelRef;
  const rect = useFixedDropdownRect(
    open && placement === "fixed",
    anchorRef,
    maxHeight,
    minWidth,
  );

  if (!open) return null;

  // Keep portaled/absolute panels from being treated as "outside" by parent
  // popovers that listen for document mousedown/pointerdown (e.g. city filter).
  const stopOutsideDismiss = {
    "data-fixed-dropdown-portal": "",
    onPointerDown: (e: ReactPointerEvent) => e.stopPropagation(),
    onMouseDown: (e: ReactMouseEvent) => e.stopPropagation(),
  };

  if (placement === "absolute") {
    return (
      <div
        ref={panelRef}
        className={mergePanelClass(ABSOLUTE_CLASS, className)}
        style={{ maxHeight }}
        {...stopOutsideDismiss}
      >
        {children}
      </div>
    );
  }

  if (!rect || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      className={mergePanelClass(FIXED_CLASS, className)}
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        maxHeight: rect.maxHeightPx,
      }}
      {...stopOutsideDismiss}
    >
      {children}
    </div>,
    document.body,
  );
}
