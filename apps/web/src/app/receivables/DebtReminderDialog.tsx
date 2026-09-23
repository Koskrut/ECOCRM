"use client";

import { useMemo, useState } from "react";
import { Copy, Send, ExternalLink } from "lucide-react";
import { strings } from "@/locales";
import type { WorkClientRow } from "@/lib/api/resources/receivables";
import { formatMoney } from "./format-money";

export type ReminderTemplateId = "payment" | "payLink" | "brokenPromise";

async function fetchPayLink(orderId: string): Promise<string | null> {
  const r = await fetch(`/api/orders/${orderId}/payment-requests`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!r.ok) return null;
  const data = (await r.json()) as Array<{ effectiveStatus?: string; publicToken?: string }>;
  const pending = (Array.isArray(data) ? data : []).find(
    (row) => row.effectiveStatus === "PENDING" && row.publicToken,
  );
  if (!pending?.publicToken) return null;
  return `${window.location.origin}/pay/${pending.publicToken}`;
}

function fillTemplate(
  template: string,
  vars: { clientName: string; amount: string; payLink: string },
): string {
  return template
    .replaceAll("{clientName}", vars.clientName)
    .replaceAll("{amount}", vars.amount)
    .replaceAll("{payLink}", vars.payLink);
}

export function DebtReminderDialog({
  row,
  currency,
  onClose,
  onSendTelegram,
}: {
  row: WorkClientRow;
  currency: string;
  onClose: () => void;
  onSendTelegram: (text: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const t = strings.receivables;
  const [templateId, setTemplateId] = useState<ReminderTemplateId>("payment");
  const [payLink, setPayLink] = useState("");
  const [loadingLink, setLoadingLink] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const amount = formatMoney(row.overdueAmount || row.debtAmount, currency);

  const templates: { id: ReminderTemplateId; label: string; body: string }[] = useMemo(
    () => [
      { id: "payment", label: t.reminderTplPayment, body: t.reminderBodyPayment },
      { id: "payLink", label: t.reminderTplPayLink, body: t.reminderBodyPayLink },
      { id: "brokenPromise", label: t.reminderTplBroken, body: t.reminderBodyBroken },
    ],
    [t],
  );

  const active = templates.find((x) => x.id === templateId) ?? templates[0];
  const text = fillTemplate(active.body, {
    clientName: row.clientName,
    amount,
    payLink: payLink || "…",
  });

  const ensurePayLink = async () => {
    if (payLink || !row.primaryOrderId) return payLink;
    setLoadingLink(true);
    try {
      const link = await fetchPayLink(row.primaryOrderId);
      if (link) setPayLink(link);
      return link ?? "";
    } finally {
      setLoadingLink(false);
    }
  };

  const handleCopy = async () => {
    let link = payLink;
    if (templateId === "payLink") {
      link = (await ensurePayLink()) || link;
    }
    const final = fillTemplate(active.body, {
      clientName: row.clientName,
      amount,
      payLink: link || "…",
    });
    await navigator.clipboard.writeText(final);
    setStatus(t.reminderCopied);
  };

  const handleTelegram = async () => {
    setSending(true);
    setStatus(null);
    try {
      let link = payLink;
      if (templateId === "payLink") {
        link = (await ensurePayLink()) || link;
      }
      const final = fillTemplate(active.body, {
        clientName: row.clientName,
        amount,
        payLink: link || "…",
      });
      const res = await onSendTelegram(final);
      if (res.ok) setStatus(t.reminderSentTelegram);
      else setStatus(res.error ?? t.reminderTelegramMissing);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-full max-w-lg flex-col rounded-xl bg-white shadow-xl">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-zinc-900">{t.remindTitle}</h2>
          <p className="mt-0.5 truncate text-sm text-zinc-500">{row.clientName}</p>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div className="flex flex-wrap gap-1.5">
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => setTemplateId(tpl.id)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  templateId === tpl.id
                    ? "bg-zinc-800 text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                }`}
              >
                {tpl.label}
              </button>
            ))}
          </div>

          <textarea
            readOnly
            value={text}
            rows={5}
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800"
          />

          {status ? <p className="text-xs text-zinc-600">{status}</p> : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
          >
            {t.commentCancel}
          </button>
          <a
            href={`/inbox/telegram`}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t.reminderOpenInbox}
          </a>
          <button
            type="button"
            onClick={() => void handleCopy()}
            disabled={loadingLink}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            <Copy className="h-3.5 w-3.5" />
            {t.reminderCopy}
          </button>
          <button
            type="button"
            onClick={() => void handleTelegram()}
            disabled={sending || loadingLink}
            className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            {sending ? "…" : t.reminderSendTelegram}
          </button>
        </div>
      </div>
    </div>
  );
}
