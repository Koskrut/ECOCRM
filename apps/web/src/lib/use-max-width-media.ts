"use client";

import { useEffect, useState } from "react";

/** True when viewport width is at most `maxWidthPx` (mobile / narrow layouts). */
export function useMaxWidthMedia(maxWidthPx: number): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidthPx}px)`);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [maxWidthPx]);

  return matches;
}
