"use client";

import { useCallback, useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { DateTime } from "luxon";
import { CRM_LOCALE, CRM_TIME_ZONE } from "@/lib/crmDatetime";

export type LinkedTelegramAccount = {
  id: string;
  telegramChatId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  lastMessageAt: string | null;
  linkedAt: string;
};

type Props = {
  contactId: string;
  /** When set, load via the open inbox thread so a manager can see sibling logins. */
  conversationId?: string | null;
  currentChatId?: string | null;
  onChanged?: () => void;
};

function accountLabel(account: LinkedTelegramAccount): string {
  const name = [account.firstName, account.lastName].filter(Boolean).join(" ").trim();
  const handle = account.username?.replace(/^@/, "").trim();
  if (name && handle) return `${name} · @${handle}`;
  if (handle) return `@${handle}`;
  if (name) return name;
  return `Telegram ${account.telegramChatId}`;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const d = DateTime.fromISO(iso, { setZone: true }).setZone(CRM_TIME_ZONE);
  if (!d.isValid) return "";
  return d.setLocale(CRM_LOCALE).toLocaleString(DateTime.DATETIME_SHORT);
}

export function ContactTelegramAccounts({
  contactId,
  conversationId,
  currentChatId,
  onChanged,
}: Props) {
  const [items, setItems] = useState<LinkedTelegramAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!contactId) return;
    setLoading(true);
    setError(null);
    try {
      const url = conversationId
        ? `/conversations/${conversationId}/telegram-accounts`
        : `/contacts/${contactId}/telegram-accounts`;
      const res = await apiHttp.get<{ items: LinkedTelegramAccount[] }>(url);
      setItems(res.data?.items ?? []);
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : "Не вдалося завантажити Telegram-акаунти");
    } finally {
      setLoading(false);
    }
  }, [contactId, conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const unlink = async (accountId: string) => {
    setBusyId(accountId);
    setError(null);
    try {
      if (conversationId) {
        await apiHttp.delete(`/conversations/${conversationId}/telegram-accounts/${accountId}`);
      } else {
        await apiHttp.delete(`/contacts/${contactId}/telegram-accounts/${accountId}`);
      }
      setItems((prev) => prev.filter((row) => row.id !== accountId));
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося відв’язати Telegram");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Telegram</p>
      <p className="mt-1 text-xs text-zinc-500">
        Кілька акаунтів можуть замовляти на цей контакт. Чати лишаються окремими.
      </p>
      {loading ? <p className="mt-2 text-xs text-zinc-500">Завантаження…</p> : null}
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      {!loading && items.length === 0 ? (
        <p className="mt-2 text-xs text-zinc-500">Немає прив’язаних акаунтів</p>
      ) : null}
      {items.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {items.map((account) => {
            const current = currentChatId != null && account.telegramChatId === currentChatId;
            const when = formatWhen(account.lastMessageAt ?? account.linkedAt);
            return (
              <li key={account.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-zinc-900">
                    {accountLabel(account)}
                    {current ? (
                      <span className="ml-1 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
                        цей чат
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-zinc-500">
                    {account.phone ? `${account.phone} · ` : ""}
                    {when}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busyId === account.id}
                  onClick={() => void unlink(account.id)}
                  className="shrink-0 text-xs text-zinc-500 hover:text-zinc-900 disabled:opacity-50"
                >
                  {busyId === account.id ? "…" : "Відв’язати"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
