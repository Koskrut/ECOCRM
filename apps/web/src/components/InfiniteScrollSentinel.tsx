"use client";

import { useEffect, useRef } from "react";

export function InfiniteScrollSentinel({
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

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) onVisibleRef.current();
      },
      { root: null, rootMargin: "200px", threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [disabled]);

  return <div ref={ref} className="h-px w-full" aria-hidden />;
}
