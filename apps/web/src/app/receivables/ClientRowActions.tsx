"use client";

import { useState, useRef, useEffect } from "react";
import { Copy, MessageSquarePlus, Bell, MoreHorizontal } from "lucide-react";
import { KyivstarDialButton } from "@/components/kyivstar/KyivstarDialButton";
import { strings } from "@/locales";
import type { WorkClientRow } from "@/lib/api/resources/receivables";

const iconBtn =
  "inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900";

export function ClientRowActions({
  row,
  onComment,
  onCopyPay,
  onRemind,
  compact = false,
}: {
  row: WorkClientRow;
  onComment: (row: WorkClientRow) => void;
  onCopyPay: (row: WorkClientRow) => void;
  onRemind?: (row: WorkClientRow) => void;
  /** When true, icons stay visible (card / touch). When false, hover-reveal in table. */
  compact?: boolean;
}) {
  const t = strings.receivables;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const wrapClass = compact
    ? "flex flex-wrap items-center gap-1"
    : "flex flex-wrap items-center gap-1 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-within:opacity-100";

  return (
    <div className={wrapClass}>
      {row.phone ? <KyivstarDialButton phone={row.phone} size="sm" label="" /> : null}
      {row.primaryOrderId ? (
        <button
          type="button"
          onClick={() => onCopyPay(row)}
          className={iconBtn}
          title={t.copyPayLink}
          aria-label={t.copyPayLink}
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onComment(row)}
        className={iconBtn}
        title={t.commentAdd}
        aria-label={t.commentAdd}
      >
        <MessageSquarePlus className="h-3.5 w-3.5" />
      </button>
      {onRemind ? (
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className={iconBtn}
            title={t.moreActions}
            aria-label={t.moreActions}
            aria-expanded={menuOpen}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 z-20 mt-1 min-w-[10rem] rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-50"
                onClick={() => {
                  setMenuOpen(false);
                  onRemind(row);
                }}
              >
                <Bell className="h-3.5 w-3.5" />
                {t.remindAction}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
