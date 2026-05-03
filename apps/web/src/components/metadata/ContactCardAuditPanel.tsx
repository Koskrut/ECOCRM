"use client";

import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { formatDateTime } from "@/lib/crmDatetime";

type AuditRow = {
  id: string;
  action: string;
  changedBy: string;
  createdAt: string;
};

export function ContactCardAuditPanel({ contactId }: { contactId: string }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!contactId) return;
    let cancelled = false;
    setErr(null);
    apiHttp
      .get<{ items?: AuditRow[] }>(`/audit/Contact/${contactId}?pageSize=20`)
      .then((r) => {
        if (cancelled) return;
        setRows(r.data?.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setErr("Audit недоступний або немає прав MetadataRead.");
      });
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  if (err) {
    return <p className="text-xs text-red-600">{err}</p>;
  }
  if (rows.length === 0) {
    return <p className="text-xs text-zinc-500">Записів audit для цього контакту поки немає.</p>;
  }

  return (
    <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-zinc-700">
      {rows.map((a) => (
        <li key={a.id} className="rounded border border-zinc-100 bg-white px-2 py-1">
          <span className="font-medium">{a.action}</span> · {a.changedBy} · {formatDateTime(a.createdAt)}
        </li>
      ))}
    </ul>
  );
}
