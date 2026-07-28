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
import { useMaxWidthMedia } from "@/lib/use-max-width-media";

export type FixedDropdownRect = {
  top: number;
  left: number;
  width: number;
};

export function useFixedDropdownRect(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
) {
  const [rect, setRect] = useState<FixedDropdownRect | null>(null);

  const updateRect = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    setRect({
      top: box.bottom + 4,
      left: box.left,
      width: box.width,
    });
  }, [anchorRef]);

  useEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }
    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
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
  /** CSS length used inside min(..., calc(100dvh - top - 8px)). Default 14rem. */
  maxHeight?: string;
  className?: string;
  /** fixed = portal to body; absolute = in-place under a relative parent; omit = auto (absolute on ≤767px). */
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
  placement,
  children,
}: FixedDropdownPortalProps) {
  const isNarrowViewport = useMaxWidthMedia(767);
  const effectivePlacement = placement ?? (isNarrowViewport ? "absolute" : "fixed");
  const localPanelRef = useRef<HTMLDivElement | null>(null);
  const panelRef = panelRefProp ?? localPanelRef;
  const rect = useFixedDropdownRect(open && effectivePlacement === "fixed", anchorRef);

  if (!open) return null;

  // Keep portaled/absolute panels from being treated as "outside" by parent
  // popovers that listen for document mousedown/pointerdown (e.g. city filter).
  const stopOutsideDismiss = {
    "data-fixed-dropdown-portal": "",
    onPointerDown: (e: ReactPointerEvent) => e.stopPropagation(),
    onMouseDown: (e: ReactMouseEvent) => e.stopPropagation(),
  };

  if (effectivePlacement === "absolute") {
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
        width: Math.max(rect.width, minWidth),
        maxHeight: `min(${maxHeight}, calc(100dvh - ${rect.top}px - 8px))`,
      }}
      {...stopOutsideDismiss}
    >
      {children}
    </div>,
    document.body,
  );
}
