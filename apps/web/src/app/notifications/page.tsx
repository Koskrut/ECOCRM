"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ListTodo } from "lucide-react";
import {
  notificationsApi,
  notificationHref,
  type UserNotification,
} from "@/lib/api/resources/notifications";
import { CRM_LOCALE, CRM_TIME_ZONE } from "@/lib/crmDatetime";
import { strings } from "@/locales";
import { useActiveTasksCount } from "@/lib/use-active-tasks-count";

import { DateTime } from "luxon";

function formatCountBadge(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}

function formatWhen(iso: string): string {
  const d = DateTime.fromISO(iso, { setZone: true }).setZone(CRM_TIME_ZONE);
  if (!d.isValid) return iso;
  return d.setLocale(CRM_LOCALE).toLocaleString(DateTime.DATETIME_SHORT);
}

export default function NotificationsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const activeTasksCount = useActiveTasksCount(true, pathname);
  const tasksBadge = formatCountBadge(activeTasksCount);
  const [items, setItems] = useState<UserNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  const pageSize = 30;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await notificationsApi.list({ page, pageSize, unreadOnly });
      setItems(res.items);
      setTotal(res.total);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, unreadOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const openItem = async (n: UserNotification) => {
    if (!n.readAt) {
      try {
        await notificationsApi.markRead(n.id);
      } catch {
        /* ignore */
      }
    }
    const href = notificationHref(n);
    if (href) router.push(href);
  };

  const markAllRead = async () => {
    await notificationsApi.markAllRead();
    await load();
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Сповіщення</h1>
          <p className="text-sm text-zinc-500">Історія системних подій CRM</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => {
                setPage(1);
                setUnreadOnly(e.target.checked);
              }}
            />
            Лише непрочитані
          </label>
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50"
          >
            Прочитати все
          </button>
          <Link
            href="/settings/notifications"
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50"
          >
            Налаштування
          </Link>
        </div>
      </div>

      <Link
        href="/tasks"
        className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm transition hover:bg-zinc-50"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-600">
            <ListTodo className="size-4" aria-hidden />
          </span>
          <span>
            <span className="block text-sm font-medium text-zinc-900">{strings.notifications.activeTasksLink}</span>
            <span className="block text-xs text-zinc-500">{strings.nav.tasks}</span>
          </span>
        </span>
        {tasksBadge ? (
          <span className="flex min-w-[24px] items-center justify-center rounded-full bg-red-600 px-2 py-1 text-xs font-semibold text-white">
            {tasksBadge}
          </span>
        ) : (
          <span className="text-xs text-zinc-400">{strings.notifications.noActiveTasks}</span>
        )}
      </Link>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {loading ? (
          <div className="px-4 py-10 text-center text-sm text-zinc-500">Завантаження…</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-zinc-500">Немає сповіщень</div>
        ) : (
          <ul>
            {items.map((n) => (
              <li key={n.id} className="border-b border-zinc-100 last:border-b-0">
                <button
                  type="button"
                  onClick={() => void openItem(n)}
                  className={`block w-full px-4 py-3 text-left hover:bg-zinc-50 ${!n.readAt ? "bg-blue-50/30" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-medium text-zinc-900">{n.title}</span>
                    {!n.readAt && (
                      <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                        нове
                      </span>
                    )}
                  </div>
                  {n.body && <p className="mt-1 whitespace-pre-line text-sm text-zinc-600">{n.body}</p>}
                  <p className="mt-1 text-xs text-zinc-400">{formatWhen(n.createdAt)}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded border px-3 py-1 text-sm disabled:opacity-40"
          >
            Назад
          </button>
          <span className="text-sm text-zinc-600">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border px-3 py-1 text-sm disabled:opacity-40"
          >
            Далі
          </button>
        </div>
      )}
    </div>
  );
}
