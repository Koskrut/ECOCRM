"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type MouseEventHandler, type WheelEventHandler } from "react";
import { createPortal } from "react-dom";
import { getSubcategoryFacets } from "@/lib/api";

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** One subtle horizontal nudge so users notice the row scrolls (only if overflow). */
function runScrollPeekHint(el: HTMLElement): (() => void) | undefined {
  if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return undefined;
  }
  if (el.scrollWidth <= el.clientWidth + 1) return undefined;
  const maxScroll = el.scrollWidth - el.clientWidth;
  const delta = Math.min(56, Math.max(22, Math.round(maxScroll * 0.14)));
  const start = el.scrollLeft;
  const downMs = 420;
  const pauseMs = 100;
  const upMs = 480;
  let raf = 0;
  let cancelled = false;
  let startTime: number | null = null;
  let phase: "down" | "pause" | "up" = "down";
  let pauseStart = 0;

  const tick = (now: number) => {
    if (cancelled) return;
    if (startTime === null) startTime = now;
    const elapsed = now - startTime;

    if (phase === "down") {
      const t = Math.min(1, elapsed / downMs);
      el.scrollTo({ left: start + delta * easeOutCubic(t), behavior: "auto" });
      if (t >= 1) {
        phase = "pause";
        pauseStart = now;
        startTime = now;
      }
      raf = requestAnimationFrame(tick);
    } else if (phase === "pause") {
      if (now - pauseStart >= pauseMs) {
        phase = "up";
        startTime = now;
      }
      raf = requestAnimationFrame(tick);
    } else {
      const t = Math.min(1, elapsed / upMs);
      el.scrollTo({ left: start + delta * (1 - easeOutCubic(t)), behavior: "auto" });
      if (t < 1) raf = requestAnimationFrame(tick);
      else el.scrollTo({ left: start, behavior: "auto" });
    }
  };

  raf = requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
  };
}

const drumRow =
  "flex touch-pan-x snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex-wrap lg:overflow-visible lg:touch-auto lg:snap-none";

const pillBase =
  "inline-flex shrink-0 snap-start items-center rounded-full border px-3 py-1.5 text-sm font-medium transition whitespace-nowrap";

const pillIdle = "border-[var(--border)] bg-white text-zinc-700 hover:border-[var(--primary)] hover:bg-[var(--surface)]";
const pillActive = "border-[var(--primary)] bg-[var(--primary)] text-white shadow-sm";

function buildHref(params: {
  search: string | null;
  category: string | null;
  subcategory: string | null;
}) {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.category) q.set("category", params.category);
  if (params.subcategory) q.set("subcategory", params.subcategory);
  const s = q.toString();
  return s ? `/?${s}` : "/";
}

type Props = {
  className?: string;
  /** One line with sibling controls (e.g. «Усі системи»); hides the «Підкатегорія» heading. */
  inline?: boolean;
};

export function SubcategoryFilterStrip({ className, inline }: Props) {
  const searchParams = useSearchParams();
  const search = searchParams.get("search");
  const category = searchParams.get("category");
  const activeSub = searchParams.get("subcategory");

  const [facets, setFacets] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragStartXRef = useRef(0);
  const dragStartLeftRef = useRef(0);
  const dragMovedRef = useRef(false);

  const show = Boolean(category && !search);

  useEffect(() => {
    if (!category || search) {
      setFacets([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getSubcategoryFacets(category)
      .then((items) => {
        if (!cancelled) setFacets(items);
      })
      .catch(() => {
        if (!cancelled) setFacets([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, search]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [category, activeSub]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  useLayoutEffect(() => {
    if (inline || facets.length === 0 || loading) {
      setHasOverflow(false);
      return;
    }
    const el = scrollRef.current;
    if (!el) return;

    let peekCleanup: (() => void) | undefined;
    let peekStarted = false;

    const measureOverflow = () => el.scrollWidth > el.clientWidth + 1;

    const syncOverflow = () => {
      setHasOverflow(measureOverflow());
    };

    const tryPeek = () => {
      if (peekStarted || !measureOverflow()) return;
      peekStarted = true;
      peekCleanup = runScrollPeekHint(el);
    };

    const ro = new ResizeObserver(() => {
      syncOverflow();
      requestAnimationFrame(() => tryPeek());
    });
    ro.observe(el);

    syncOverflow();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        syncOverflow();
        tryPeek();
      });
    });

    const lateTry = window.setTimeout(() => {
      syncOverflow();
      tryPeek();
    }, 400);

    return () => {
      clearTimeout(lateTry);
      ro.disconnect();
      peekCleanup?.();
    };
  }, [category, facets, loading, inline]);

  useLayoutEffect(() => {
    if (inline) return;
    const el = scrollRef.current;
    if (!el || !activeSub) return;
    const activeItem = el.querySelector<HTMLElement>('[data-active="true"]');
    if (!activeItem) return;

    activeItem.scrollIntoView({
      inline: "nearest",
      block: "nearest",
      behavior: "auto",
    });
  }, [activeSub, facets, inline]);

  if (!show) return null;

  const rootClass = [className, inline ? "w-full min-w-0" : ""].filter(Boolean).join(" ");

  if (loading && facets.length === 0) {
    return (
      <div className={rootClass}>
        <div
          className={
            inline
              ? "h-11 w-full min-w-[100px] max-w-full animate-pulse rounded-lg bg-zinc-200/80"
              : "h-9 max-w-xs animate-pulse rounded-full bg-zinc-200/80"
          }
          aria-hidden
        />
      </div>
    );
  }

  if (facets.length === 0) return null;

  if (inline) {
    const buttonLabel = activeSub || "Підкатегорії";
    const itemClass = (isActive: boolean) =>
      "flex min-h-[44px] items-center rounded-lg px-3 py-2 text-sm transition " +
      (isActive
        ? "bg-[var(--primary)] font-medium text-white"
        : "text-zinc-700 hover:bg-[var(--surface)] hover:text-[var(--primary)]");

    return (
      <div className={rootClass}>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-expanded={drawerOpen}
          aria-haspopup="dialog"
          className={
            "inline-flex min-h-[44px] w-full min-w-0 items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-[var(--surface)] " +
            (activeSub
              ? "border-[var(--primary)] text-[var(--primary)]"
              : "border-[var(--border)] text-zinc-700")
          }
        >
          <span className="min-w-0 truncate">{buttonLabel}</span>
          <svg
            className="h-4 w-4 shrink-0 text-zinc-500"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden
          >
            <path
              d="M5 7.5L10 12.5L15 7.5"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {drawerOpen && typeof document !== "undefined"
          ? createPortal(
              <div
                className="fixed inset-0 z-40 lg:hidden"
                aria-modal="true"
                role="dialog"
                aria-label="Підкатегорії каталогу"
              >
                <button
                  type="button"
                  aria-label="Закрити підкатегорії"
                  className="absolute inset-0 bg-black/40"
                  onClick={() => setDrawerOpen(false)}
                />
                <aside className="absolute inset-y-0 right-0 flex w-[85vw] max-w-xs flex-col overflow-hidden bg-white shadow-xl">
                  <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
                    <h3 className="font-heading text-base font-semibold text-zinc-900">Підкатегорії</h3>
                    <button
                      type="button"
                      aria-label="Закрити"
                      onClick={() => setDrawerOpen(false)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] text-zinc-600 transition hover:bg-[var(--surface)]"
                    >
                      <span aria-hidden>✕</span>
                    </button>
                  </div>
                  <ul className="flex-1 space-y-1 overflow-y-auto p-4">
                    <li>
                      <Link
                        href={buildHref({ search, category, subcategory: null })}
                        scroll={false}
                        onClick={() => setDrawerOpen(false)}
                        className={itemClass(!activeSub)}
                      >
                        Усі
                      </Link>
                    </li>
                    {facets.map((label) => {
                      const isActive = activeSub === label;
                      return (
                        <li key={label}>
                          <Link
                            href={buildHref({ search, category, subcategory: label })}
                            scroll={false}
                            onClick={() => setDrawerOpen(false)}
                            className={itemClass(isActive)}
                          >
                            {label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </aside>
              </div>,
              document.body,
            )
          : null}
      </div>
    );
  }

  const handleWheel: WheelEventHandler<HTMLDivElement> = (event) => {
    const el = scrollRef.current;
    if (!el || !hasOverflow) return;
    if (event.ctrlKey) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

    event.preventDefault();
    el.scrollBy({ left: event.deltaY, behavior: "auto" });
  };

  const stopDragging = () => {
    setIsDragging(false);
  };

  const handleMouseDown: MouseEventHandler<HTMLDivElement> = (event) => {
    const el = scrollRef.current;
    if (!el || !hasOverflow || event.button !== 0) return;
    dragStartXRef.current = event.clientX;
    dragStartLeftRef.current = el.scrollLeft;
    dragMovedRef.current = false;
    setIsDragging(true);
  };

  const handleMouseMove: MouseEventHandler<HTMLDivElement> = (event) => {
    const el = scrollRef.current;
    if (!el || !isDragging) return;
    const dx = event.clientX - dragStartXRef.current;
    if (Math.abs(dx) > 3) dragMovedRef.current = true;
    el.scrollLeft = dragStartLeftRef.current - dx;
  };

  const handleClickCapture: MouseEventHandler<HTMLDivElement> = (event) => {
    if (!dragMovedRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    dragMovedRef.current = false;
  };

  return (
    <div className={rootClass}>
      {!inline ? (
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">Підкатегорія</p>
      ) : null}
      <div className="relative min-w-0">
        <div
          ref={scrollRef}
          className={`${drumRow} ${hasOverflow ? (isDragging ? "cursor-grabbing select-none" : "cursor-grab") : ""}`}
          role="tablist"
          aria-label="Підкатегорії каталогу"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={stopDragging}
          onMouseLeave={stopDragging}
          onClickCapture={handleClickCapture}
        >
          {activeSub ? (
            <Link
              href={buildHref({ search, category, subcategory: null })}
              scroll={false}
              className={`${pillBase} ${pillIdle}`}
            >
              Усі
            </Link>
          ) : null}
          {facets.map((label) => {
            const isActive = activeSub === label;
            const href = buildHref({ search, category, subcategory: label });
            return (
              <Link
                key={label}
                href={href}
                scroll={false}
                data-active={isActive ? "true" : undefined}
                className={`${pillBase} ${isActive ? pillActive : pillIdle}`}
              >
                {label}
              </Link>
            );
          })}
        </div>
        {hasOverflow ? (
          <div
            className="pointer-events-none absolute inset-y-0 right-0 flex w-11 items-center justify-end bg-gradient-to-l from-white/95 from-20% via-white/80 to-transparent pr-0.5 lg:hidden"
            aria-hidden
          >
            <span className="subcat-strip-hint-arrow absolute right-0.5 top-1/2 text-lg font-light leading-none text-zinc-400 select-none">
              ›
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
