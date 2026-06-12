"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

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
  children: React.ReactNode;
};

const DEFAULT_CLASS =
  "fixed z-[100] overflow-auto rounded-md border border-zinc-200 bg-white shadow-lg";

export function FixedDropdownPortal({
  open,
  anchorRef,
  panelRef: panelRefProp,
  minWidth = 240,
  maxHeight = "14rem",
  className = DEFAULT_CLASS,
  children,
}: FixedDropdownPortalProps) {
  const localPanelRef = useRef<HTMLDivElement | null>(null);
  const panelRef = panelRefProp ?? localPanelRef;
  const rect = useFixedDropdownRect(open, anchorRef);

  if (!open || !rect || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      className={className}
      style={{
        top: rect.top,
        left: rect.left,
        width: Math.max(rect.width, minWidth),
        maxHeight: `min(${maxHeight}, calc(100dvh - ${rect.top}px - 8px))`,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
