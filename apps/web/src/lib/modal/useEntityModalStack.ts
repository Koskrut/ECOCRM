"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type EntityModalType = "contact" | "company" | "order" | "return" | "lead";

export type EntityModalFrame = {
  type: EntityModalType;
  id: string;
};

export function entityModalFramesEqual(a: EntityModalFrame, b: EntityModalFrame): boolean {
  return a.type === b.type && a.id === b.id;
}

export function entityModalZIndex(index: number): number {
  return 50 + index * 10;
}

export function nearestEntityId(
  frames: EntityModalFrame[],
  index: number,
  type: EntityModalType,
): string | null {
  for (let i = index - 1; i >= 0; i -= 1) {
    const frame = frames[i];
    if (frame.type === type && frame.id !== "new") return frame.id;
  }
  return null;
}

export function pushOrFocusFrames(
  frames: EntityModalFrame[],
  next: EntityModalFrame,
): EntityModalFrame[] {
  const existing = frames.findIndex((f) => entityModalFramesEqual(f, next));
  if (existing >= 0) return frames.slice(0, existing + 1);
  return [...frames, next];
}

export function replaceEntityFrame(
  frames: EntityModalFrame[],
  from: EntityModalFrame,
  to: EntityModalFrame,
): EntityModalFrame[] {
  const existingTo = frames.findIndex((f) => entityModalFramesEqual(f, to));
  if (existingTo >= 0) return frames.slice(0, existingTo + 1);
  const fromIdx = frames.findIndex((f) => entityModalFramesEqual(f, from));
  if (fromIdx < 0) return [...frames, to];
  const next = [...frames];
  next[fromIdx] = to;
  return next.slice(0, fromIdx + 1);
}

function toOverlays(root: EntityModalFrame | null, frames: EntityModalFrame[]): EntityModalFrame[] {
  return root ? frames.slice(1) : frames;
}

export function useEntityModalStack(root: EntityModalFrame | null) {
  const [overlays, setOverlays] = useState<EntityModalFrame[]>([]);
  const rootKey = root ? `${root.type}:${root.id}` : "";
  const prevRootKeyRef = useRef(rootKey);

  useEffect(() => {
    if (prevRootKeyRef.current === rootKey) return;
    prevRootKeyRef.current = rootKey;
    setOverlays([]);
  }, [rootKey]);

  const frames = useMemo(
    () => (root ? [root, ...overlays] : overlays),
    [overlays, root],
  );

  const open = useCallback(
    (frame: EntityModalFrame) => {
      setOverlays((current) => {
        const full = root ? [root, ...current] : current;
        return toOverlays(root, pushOrFocusFrames(full, frame));
      });
    },
    [root],
  );

  const closeFrom = useCallback(
    (index: number) => {
      setOverlays((current) => {
        const full = root ? [root, ...current] : current;
        return toOverlays(root, full.slice(0, Math.max(0, index)));
      });
    },
    [root],
  );

  const closeAll = useCallback(() => setOverlays([]), []);

  const replace = useCallback(
    (from: EntityModalFrame, to: EntityModalFrame) => {
      if (root && entityModalFramesEqual(from, root)) return;
      setOverlays((current) => {
        const full = root ? [root, ...current] : current;
        return toOverlays(root, replaceEntityFrame(full, from, to));
      });
    },
    [root],
  );

  return { overlays, frames, open, closeFrom, closeAll, replace };
}
