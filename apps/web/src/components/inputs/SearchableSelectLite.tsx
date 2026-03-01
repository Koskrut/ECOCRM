"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type Option = { id: string; label: string; meta?: unknown };

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/**
 * Minimal searchable select (no external deps).
 * - click to open
 * - type to filter
 * - shows optional "Create new" action when nothing matches
 */
export function SearchableSelectLite({
  value,
  options,
  placeholder,
  disabled,
  isLoading,
  onChange,
  onCreate,
  createLabel,
  variant = "default",
}: {
  value: string | null;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  isLoading?: boolean;
  onChange: (id: string | null) => void;
  onCreate?: (typed: string) => void;
  createLabel?: string;
  /** "inline" = same row style as InlineEditableField (text + hover underline, no border) */
  variant?: "default" | "inline";
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => options.find((o) => o.id === value) ?? null, [options, value]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) => o.label.toLowerCase().includes(s));
  }, [options, q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const isInline = variant === "inline";

  return (
    <div ref={rootRef} className={cx("relative", isInline && "min-w-0 flex-1 text-right")}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cx(
          isInline
            ? "min-w-0 w-full text-right text-sm text-zinc-900 hover:underline disabled:opacity-50"
            : "flex w-full items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2 text-left text-sm",
          !isInline && disabled && "opacity-60",
          isInline && !selected && "text-zinc-500",
        )}
      >
        <span className={cx(isInline ? "" : "truncate", selected && !isInline && "text-zinc-900")}>
          {isLoading && !selected ? "Loading…" : selected ? selected.label : placeholder ?? "Select…"}
        </span>
        {!isInline && <span className="ml-3 text-xs text-zinc-400">▾</span>}
      </button>

      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg">
          <div className="p-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={isLoading ? "Loading…" : "Search…"}
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            />
          </div>

          <div className="max-h-56 overflow-auto">
            {isLoading ? (
              <div className="px-3 py-2 text-sm text-zinc-500">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-zinc-500">
                No results
                {onCreate ? (
                  <button
                    type="button"
                    className="ml-2 rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                    onClick={() => {
                      setOpen(false);
                      onCreate(q.trim());
                    }}
                  >
                    {createLabel ?? "Create"}
                  </button>
                ) : null}
              </div>
            ) : (
              <>
                {filtered.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => {
                      onChange(o.id);
                      setOpen(false);
                    }}
                    className={cx(
                      "flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50",
                      o.id === value && "bg-zinc-50",
                    )}
                  >
                    <span className="flex-1 truncate text-zinc-900">{o.label}</span>
                  </button>
                ))}
                {onCreate ? (
                  <div className="border-t border-zinc-100 p-2">
                    <button
                      type="button"
                      className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                      onClick={() => {
                        setOpen(false);
                        onCreate(q.trim());
                      }}
                    >
                      {createLabel ?? "Create"}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
