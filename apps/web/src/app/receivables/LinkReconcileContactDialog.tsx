"use client";

import { useEffect, useState } from "react";
import { strings } from "@/locales";
import { contactsApi, type Contact } from "@/lib/api/resources/contacts";
import { receivablesApi } from "@/lib/api/resources/receivables";
import { ApiError } from "@/lib/api/errors";

function contactLabel(c: Contact): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return name || c.id;
}

export function LinkReconcileContactDialog({
  lineId,
  code1C,
  onClose,
  onLinked,
}: {
  lineId: string;
  code1C: string;
  onClose: () => void;
  onLinked: () => void;
}) {
  const t = strings.receivables;
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Contact[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void contactsApi
        .list({ q: term, page: 1, pageSize: 15 })
        .then((res) => setHits(res.items ?? []))
        .catch(() => setHits([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  const link = async (overwrite: boolean) => {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await receivablesApi.linkReconcileLineContact(lineId, {
        contactId: selectedId,
        overwrite: overwrite || undefined,
      });
      onLinked();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : t.linkContactError;
      const needsOverwrite =
        e instanceof ApiError && e.status === 400 && /overwrite|already has 1C code/i.test(msg);
      if (needsOverwrite && !overwrite) {
        const match = msg.match(/code\s+(.+?)(?:;|$)/i);
        const existing = (match?.[1] ?? "").trim();
        const ok = window.confirm(t.linkContactOverwrite(existing || "…"));
        if (ok) {
          await link(true);
          return;
        }
        setBusy(false);
        return;
      }
      setError(msg || t.linkContactError);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-4 shadow-xl">
        <h3 className="text-sm font-semibold text-zinc-900">{t.linkContactTitle}</h3>
        <p className="mt-1 font-mono text-xs text-zinc-500">{code1C}</p>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.linkContactSearch}
          className="mt-3 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          autoFocus
        />
        <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-zinc-100">
          {hits.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={`flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-zinc-50 ${
                  selectedId === c.id ? "bg-zinc-100" : ""
                }`}
              >
                <span className="font-medium text-zinc-900">{contactLabel(c)}</span>
                {c.phone ? <span className="text-xs text-zinc-500">{c.phone}</span> : null}
              </button>
            </li>
          ))}
        </ul>
        {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-50"
          >
            {t.commentCancel}
          </button>
          <button
            type="button"
            disabled={!selectedId || busy}
            onClick={() => void link(false)}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {t.linkContactConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
