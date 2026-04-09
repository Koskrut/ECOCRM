"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

export type LeadStepperStepDef = { key: string; label: string; color: "sky" | "amber" | "emerald" };

const FALLBACK_LEAD_STEPS: LeadStepperStepDef[] = [
  { key: "NEW", label: "Новий", color: "sky" },
  { key: "IN_PROGRESS", label: "В роботі", color: "amber" },
  { key: "PROCESSED", label: "Оброблено", color: "emerald" },
];

function stepIndex(stage: string, steps: LeadStepperStepDef[]) {
  const idx = steps.findIndex((s) => s.key === stage);
  return idx >= 0 ? idx : 0;
}

/**
 * Same shell as OrderModal Stepper: `border-b px-6 py-3`, mobile horizontal wheel, md+ badge row.
 */
export function LeadStepper({
  stage,
  steps: stepsProp,
  onStepClick,
  disabled,
}: {
  /** "NEW" | "IN_PROGRESS" | "PROCESSED" (map CRM statuses to PROCESSED). */
  stage: string;
  /** From GET /leads/pipeline; fallback matches legacy hardcoded stepper. */
  steps?: LeadStepperStepDef[];
  onStepClick?: (stepKey: string) => void;
  disabled?: boolean;
}) {
  const steps = stepsProp?.length ? stepsProp : FALLBACK_LEAD_STEPS;
  const activeIdx = stepIndex(stage, steps);
  const wheelRef = useRef<HTMLDivElement>(null);
  const wheelItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const wheelRafRef = useRef<number | null>(null);
  const wheelSettleTimerRef = useRef<number | null>(null);
  const suppressScrollApplyUntilRef = useRef<number>(0);
  const lastEmittedKeyRef = useRef<string | null>(null);

  const centerActiveChip = useCallback(() => {
    const el = wheelRef.current;
    const btn = wheelItemRefs.current[activeIdx];
    if (!el || !btn) return;
    const targetLeft = Math.max(0, btn.offsetLeft + btn.offsetWidth / 2 - el.clientWidth / 2);
    suppressScrollApplyUntilRef.current = Date.now() + 220;
    el.scrollTo({ left: targetLeft, behavior: "auto" });
  }, [activeIdx]);

  useLayoutEffect(() => {
    centerActiveChip();
  }, [centerActiveChip, stage]);

  useEffect(() => {
    const onResize = () => centerActiveChip();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [centerActiveChip]);

  useEffect(() => {
    lastEmittedKeyRef.current = stage;
  }, [stage]);

  const getNearestStepFromScroll = useCallback((el: HTMLDivElement) => {
    const centerX = el.scrollLeft + el.clientWidth / 2;
    let bestIdx = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    steps.forEach((_, idx) => {
      const btn = wheelItemRefs.current[idx];
      if (!btn) return;
      const btnCenter = btn.offsetLeft + btn.offsetWidth / 2;
      const dist = Math.abs(btnCenter - centerX);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = idx;
      }
    });
    return { nearestIdx: bestIdx, nearest: steps[bestIdx] };
  }, [steps]);

  useEffect(() => {
    const el = wheelRef.current;
    if (!el) return;
    const onScroll = () => {
      if (wheelRafRef.current != null) cancelAnimationFrame(wheelRafRef.current);
      wheelRafRef.current = requestAnimationFrame(() => {
        const { nearestIdx, nearest } = getNearestStepFromScroll(el);

        if (wheelSettleTimerRef.current != null) window.clearTimeout(wheelSettleTimerRef.current);
        wheelSettleTimerRef.current = window.setTimeout(() => {
          if (Date.now() < suppressScrollApplyUntilRef.current) return;
          if (!onStepClick || disabled || !nearest?.key) return;
          if (nearest.key === lastEmittedKeyRef.current) return;
          lastEmittedKeyRef.current = nearest.key;
          onStepClick(nearest.key);
        }, 140);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (wheelRafRef.current != null) cancelAnimationFrame(wheelRafRef.current);
      if (wheelSettleTimerRef.current != null) window.clearTimeout(wheelSettleTimerRef.current);
      wheelRafRef.current = null;
      wheelSettleTimerRef.current = null;
    };
  }, [stage, disabled, onStepClick, getNearestStepFromScroll, steps]);

  const colorClasses = (c: LeadStepperStepDef["color"]) => {
    switch (c) {
      case "sky":
        return {
          on: "bg-sky-600 text-white border-sky-600",
          off: "bg-zinc-100 text-zinc-600 border-zinc-200",
        };
      case "amber":
        return {
          on: "bg-amber-500 text-white border-amber-500",
          off: "bg-zinc-100 text-zinc-600 border-zinc-200",
        };
      case "emerald":
        return {
          on: "bg-emerald-600 text-white border-emerald-600",
          off: "bg-zinc-100 text-zinc-600 border-zinc-200",
        };
      default:
        return {
          on: "bg-zinc-900 text-white border-zinc-900",
          off: "bg-zinc-100 text-zinc-600 border-zinc-200",
        };
    }
  };

  const isDone = (idx: number) => idx <= activeIdx;

  return (
    <div className="border-b border-zinc-200 px-6 py-3">
      <div className="md:hidden">
        <div className="relative">
          <div
            ref={wheelRef}
            className="overflow-x-auto overflow-y-hidden snap-x snap-mandatory [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className="flex items-center gap-0.5 px-[calc(50%-3.5rem)]">
              {steps.map((s, idx) => {
                const isActive = s.key === stage;
                const distance = Math.abs(idx - activeIdx);
                return (
                  <button
                    key={s.key}
                    ref={(el) => {
                      wheelItemRefs.current[idx] = el;
                    }}
                    type="button"
                    onClick={() => {
                      if (!onStepClick || disabled) return;
                      const next = steps[Math.min(activeIdx + 1, steps.length - 1)];
                      const target = isActive ? next?.key ?? s.key : s.key;
                      lastEmittedKeyRef.current = target;
                      onStepClick(target);
                    }}
                    disabled={disabled || !onStepClick}
                    className={cx(
                      "block h-10 w-28 shrink-0 snap-center rounded-md px-1 text-center text-sm transition disabled:cursor-not-allowed",
                      isActive ? "font-semibold text-zinc-900" : "font-medium text-zinc-600",
                      distance >= 2 ? "opacity-40" : distance === 1 ? "opacity-70" : "opacity-100",
                    )}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="hidden flex-wrap items-center gap-2 md:flex">
        {steps.map((s, idx) => {
          const done = isDone(idx);
          const cls = colorClasses(s.color);
          const canClick = onStepClick && !disabled;
          const badge = <Badge className={done ? cls.on : cls.off}>{s.label}</Badge>;
          return canClick ? (
            <button
              key={s.key}
              type="button"
              onClick={() => onStepClick(s.key)}
              className="rounded focus:outline-none focus:ring-2 focus:ring-zinc-400"
            >
              {badge}
            </button>
          ) : (
            <span key={s.key}>{badge}</span>
          );
        })}
      </div>
    </div>
  );
}

export function leadStatusToUiStage(
  status: string,
  uiStepByStatus?: Partial<Record<string, "NEW" | "IN_PROGRESS" | "PROCESSED">> | null,
): "NEW" | "IN_PROGRESS" | "PROCESSED" {
  const mapped = uiStepByStatus?.[status];
  if (mapped) return mapped;
  if (status === "NEW") return "NEW";
  if (status === "IN_PROGRESS") return "IN_PROGRESS";
  return "PROCESSED";
}
