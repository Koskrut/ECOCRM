/** Capture window scroll, run work, then restore (keeps list position after modal refresh). */
export async function withPreservedScroll<T>(fn: () => Promise<T>): Promise<T> {
  const y = typeof window !== "undefined" ? window.scrollY : 0;
  try {
    return await fn();
  } finally {
    if (typeof window !== "undefined") {
      requestAnimationFrame(() => {
        window.scrollTo(0, y);
      });
    }
  }
}
