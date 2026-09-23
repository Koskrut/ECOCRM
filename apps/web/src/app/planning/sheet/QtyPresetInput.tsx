"use client";

import { useMemo, useRef, useState } from "react";
import { strings } from "@/locales";

function buildPresets(recommended: number | null | undefined, lotBase: number): number[] {
  const base = lotBase > 1 ? lotBase : 100;
  const fromLots = [base, base * 2, base * 5];
  const out: number[] = [];
  const push = (n: number) => {
    if (!(n > 0) || out.includes(n)) return;
    out.push(n);
  };
  if (recommended != null && recommended > 0) push(Math.round(recommended));
  for (const n of fromLots) push(n);
  return out.slice(0, 4);
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  recommended?: number | null;
  lotBase: number;
  className?: string;
};

export function QtyPresetInput({
  value,
  onChange,
  disabled,
  recommended,
  lotBase,
  className = "w-16 rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-xs",
}: Props) {
  const sh = strings.planning.sheet;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const presets = useMemo(() => buildPresets(recommended, lotBase), [recommended, lotBase]);

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="number"
        min={0}
        className={className}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay so preset mousedown can fire first
          window.setTimeout(() => {
            if (!wrapRef.current?.contains(document.activeElement)) setOpen(false);
          }, 120);
        }}
      />
      {open && presets.length > 0 ? (
        <div
          className="absolute left-0 top-full z-20 mt-1 flex min-w-[7rem] flex-wrap gap-1 rounded-md border border-zinc-200 bg-white p-1.5 shadow-lg"
          role="listbox"
          aria-label={sh.presetHint}
        >
          {presets.map((n) => (
            <button
              key={n}
              type="button"
              className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-800 hover:bg-indigo-100 hover:text-indigo-900"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(String(n));
                setOpen(false);
              }}
            >
              {n}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
