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
import { computeFixedDropdownRect, type FixedDropdownRect } from "./fixed-dropdown-rect";

export type { FixedDropdownRect };

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

/** Visual position of `position:fixed; top:0; left:0`. Reused so measuring does not thrash layout. */
let fixedOriginProbe: HTMLDivElement | null = null;

function readFixedOrigin(): { x: number; y: number } {
  if (typeof document === "undefined") return { x: 0, y: 0 };
  if (!fixedOriginProbe) {
    fixedOriginProbe = document.createElement("div");
    fixedOriginProbe.setAttribute("aria-hidden", "true");
    fixedOriginProbe.style.cssText =
      "position:fixed;top:0;left:0;width:0;height:0;margin:0;padding:0;border:0;pointer-events:none;visibility:hidden";
    document.body.appendChild(fixedOriginProbe);
  }
  const origin = fixedOriginProbe.getBoundingClientRect();
  return { x: origin.left, y: origin.top };
}

function sameRect(a: FixedDropdownRect, b: FixedDropdownRect): boolean {
  return (
    a.openedUp === b.openedUp &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.maxHeightPx - b.maxHeightPx) < 0.5
  );
}

export function useFixedDropdownRect(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  maxHeight: string,
  minWidth: number,
) {
  const [rect, setRect] = useState<FixedDropdownRect | null>(null);
  const preferUpRef = useRef(false);

  const updateRect = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const origin = readFixedOrigin();
    const next = computeFixedDropdownRect({
      box: { top: box.top, left: box.left, bottom: box.bottom, width: box.width },
      viewportWidth: vv?.width ?? window.innerWidth,
      viewportHeight: vv?.height ?? window.innerHeight,
      fixedOriginX: origin.x,
      fixedOriginY: origin.y,
      preferredMaxPx: parseCssLengthToPx(maxHeight, 224),
      minWidth,
      preferUp: preferUpRef.current,
    });
    preferUpRef.current = next.openedUp;
    const placed: FixedDropdownRect = {
      top: next.top,
      left: next.left,
      width: next.width,
      maxHeightPx: next.maxHeightPx,
      openedUp: next.openedUp,
    };
    setRect((prev) => (prev && sameRect(prev, placed) ? prev : placed));
  }, [anchorRef, maxHeight, minWidth]);

  useEffect(() => {
    if (!open) {
      preferUpRef.current = false;
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
    const onScroll = (event: Event) => {
      const target = event.target;
      // Scrolling the list itself must not reposition it (that feedback is the "fly").
      if (target instanceof Element && target.closest("[data-fixed-dropdown-portal]")) return;
      schedule();
    };
    updateRect();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", onScroll, true);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", schedule);
    vv?.addEventListener("scroll", schedule);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", onScroll, true);
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
  "fixed z-[100] overflow-auto overscroll-contain rounded-md border border-zinc-200 bg-white shadow-lg";

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
        transform: rect.openedUp ? "translateY(-100%)" : undefined,
      }}
      {...stopOutsideDismiss}
    >
      {children}
    </div>,
    document.body,
  );
}
