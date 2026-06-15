"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { DateTime } from "luxon";
import {
  notificationsApi,
  notificationHref,
  type UserNotification,
} from "@/lib/api/resources/notifications";
import { CRM_LOCALE, CRM_TIME_ZONE } from "@/lib/crmDatetime";

const POLL_MS = 30_000;

function formatRelativeTime(iso: string): string {
  const d = DateTime.fromISO(iso, { setZone: true }).setZone(CRM_TIME_ZONE);
  if (!d.isValid) return iso;
  const now = DateTime.now().setZone(CRM_TIME_ZONE);
  const diffMin = Math.floor(now.diff(d, "minutes").minutes);
  if (diffMin < 1) return "щойно";
  if (diffMin < 60) return `${diffMin} хв тому`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} год тому`;
  return d.setLocale(CRM_LOCALE).toLocaleString({ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);
  const browserEnabledRef = useRef(false);

  useEffect(() => {
    void notificationsApi
      .getPreferences()
      .then((prefs) => {
        browserEnabledRef.current =
          prefs.types.some((t) => t.browser) ||
          (typeof localStorage !== "undefined" &&
            localStorage.getItem("crm_notifications_browser") === "1");
      })
      .catch(() => {
        browserEnabledRef.current = false;
      });
  }, []);

  const refreshCount = useCallback(async () => {
    try {
      const count = await notificationsApi.unreadCount();
      setUnreadCount(count);
      if (
        count > lastCountRef.current &&
        browserEnabledRef.current &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        new Notification("Нове сповіщення CRM", {
          body: count === 1 ? "У вас 1 непрочитане сповіщення" : `У вас ${count} непрочитаних сповіщень`,
          tag: "crm-notifications",
        });
      }
      lastCountRef.current = count;
    } catch {
      /* ignore transient errors */
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await notificationsApi.list({ pageSize: 20 });
      setItems(res.items);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (document.hidden) return;
      if (!cancelled) await refreshCount();
    };

    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return;
    void loadList();
    void refreshCount();
  }, [open, loadList, refreshCount]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onItemClick = async (n: UserNotification) => {
    if (!n.readAt) {
      try {
        await notificationsApi.markRead(n.id);
        setUnreadCount((c) => Math.max(0, c - 1));
        setItems((prev) =>
          prev.map((row) => (row.id === n.id ? { ...row, readAt: new Date().toISOString() } : row)),
        );
      } catch {
        /* ignore */
      }
    }
    setOpen(false);
    const href = notificationHref(n);
    if (href) router.push(href);
  };

  const markAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      setUnreadCount(0);
      lastCountRef.current = 0;
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    } catch {
      /* ignore */
    }
  };

  const badge =
    unreadCount > 99 ? "99+" : unreadCount > 0 ? String(unreadCount) : null;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex size-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
        aria-label="Сповіщення"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell className="size-4" />
        {badge && (
          <span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg sm:w-96">
          <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
            <span className="text-sm font-semibold text-zinc-900">Сповіщення</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-xs text-blue-600 hover:underline"
              >
                Прочитати все
              </button>
            )}
          </div>

          <div className="max-h-[min(24rem,70vh)] overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-zinc-500">Завантаження…</div>
            ) : items.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-zinc-500">Немає сповіщень</div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => void onItemClick(n)}
                  className={`block w-full border-b border-zinc-50 px-3 py-2.5 text-left hover:bg-zinc-50 ${
                    !n.readAt ? "bg-blue-50/40" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-zinc-900 line-clamp-2">{n.title}</span>
                    {!n.readAt && (
                      <span className="mt-1 size-2 shrink-0 rounded-full bg-blue-600" aria-hidden />
                    )}
                  </div>
                  {n.body && (
                    <p className="mt-0.5 whitespace-pre-line text-xs text-zinc-600 line-clamp-3">{n.body}</p>
                  )}
                  <p className="mt-1 text-[11px] text-zinc-400">{formatRelativeTime(n.createdAt)}</p>
                </button>
              ))
            )}
          </div>

          <div className="border-t border-zinc-100 p-2">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-2 py-1.5 text-center text-xs text-zinc-600 hover:bg-zinc-50"
            >
              Всі сповіщення
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
