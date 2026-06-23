"use client";

import { useEffect, useRef } from "react";

export function KanbanLoadSentinel({
  onVisible,
  disabled,
}: {
  onVisible: () => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onVisibleRef = useRef(onVisible);
  onVisibleRef.current = onVisible;

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;
    const root = el.parentElement;
    if (!root) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) onVisibleRef.current();
      },
      { root, rootMargin: "120px", threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [disabled]);

  return <div ref={ref} className="h-px w-full shrink-0" aria-hidden />;
}

export const KANBAN_COLUMN_BODY_CLASS =
  "max-h-[calc(100dvh-14rem)] min-h-[160px] space-y-3 overflow-y-auto p-3";
