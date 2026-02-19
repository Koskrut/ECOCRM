"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type SearchableSelectOption = {
  id: string;
  label: string;
  hint?: string;
};

type Props = {
  options: SearchableSelectOption[];
  value: string | null;
  onChange: (id: string | null) => void;

  placeholder?: string;
  disabled?: boolean;
  isLoading?: boolean;

  /** Если хочешь поведение “не нашёл — предложить создать нового” */
  onCreateNew?: (typed: string) => void;
  createLabel?: string; // например: "Create new contact"
};

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Search…",
  disabled,
  isLoading,
  onCreateNew,
  createLabel = "Create new",
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => options.find((o) => o.id === value) ?? null, [options, value]);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // синхроним инпут с текущим value
  useEffect(() => {
    setQuery(selected?.label ?? "");
  }, [selected?.label]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 50);
    return options
      .filter((o) => o.label.toLowerCase().includes(q) || (o.hint ?? "").toLowerCase().includes(q))
      .slice(0, 50);
  }, [options, query]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const commitSelect = (id: string | null) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => !disabled && setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 pr-10 text-sm outline-none focus:border-zinc-500 disabled:bg-zinc-100"
        />

        {/* right icon */}
        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
          {isLoading ? (
            <span className="text-xs text-zinc-500">…</span>
          ) : (
            <span className="text-xs text-zinc-500">▾</span>
          )}
        </div>
      </div>

      {open && !disabled ? (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg">
          <div className="max-h-64 overflow-auto py-1">
            {/* Clear */}
            {value ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  commitSelect(null);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-50"
              >
                <span className="text-zinc-700">— Clear</span>
                <span className="text-xs text-zinc-400">Esc</span>
              </button>
            ) : null}

            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-zinc-500">
                Nothing found
                {onCreateNew ? (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        const typed = query.trim();
                        setOpen(false);
                        onCreateNew(typed);
                      }}
                      className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
                    >
                      + {createLabel}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              filtered.map((o) => {
                const active = o.id === value;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => commitSelect(o.id)}
                    className={`flex w-full items-start justify-between px-3 py-2 text-left text-sm hover:bg-zinc-50 ${
                      active ? "bg-zinc-50" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <div
                        className={`truncate ${active ? "font-medium text-zinc-900" : "text-zinc-900"}`}
                      >
                        {o.label}
                      </div>
                      {o.hint ? (
                        <div className="truncate text-xs text-zinc-500">{o.hint}</div>
                      ) : null}
                    </div>
                    {active ? <div className="ml-3 text-xs text-emerald-600">✓</div> : null}
                  </button>
                );
              })
            )}

            {filtered.length > 0 && onCreateNew ? (
              <div className="border-t border-zinc-100 px-3 py-2">
                <button
                  type="button"
                  onClick={() => {
                    const typed = query.trim();
                    setOpen(false);
                    onCreateNew(typed);
                  }}
                  className="w-full rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  + {createLabel}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
