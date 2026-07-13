"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  notificationsApi,
  type NotificationType,
  type NotificationPreferencesResponse,
} from "@/lib/api/resources/notifications";
import { authApi } from "@/lib/api/resources/auth";

const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  ORDER_QTY_CHANGED: "Зміна кількості в замовленні (склад)",
  ORDER_SPLIT: "Розділення замовлення по залишках",
  ORDER_STAGE_CHANGED: "Зміна стадії замовлення (склад)",
  MISSED_CALL: "Пропущений дзвінок",
  NEW_LEAD: "Новий лід",
  TASK_ASSIGNED: "Нова задача",
  TELEGRAM_MESSAGE: "Повідомлення в Telegram Inbox",
  META_INSTAGRAM_MESSAGE: "Повідомлення в Instagram Inbox",
  META_FACEBOOK_MESSAGE: "Повідомлення в Facebook Messenger Inbox",
};

const ALL_TYPES: NotificationType[] = [
  "ORDER_QTY_CHANGED",
  "ORDER_SPLIT",
  "ORDER_STAGE_CHANGED",
  "MISSED_CALL",
  "NEW_LEAD",
  "TASK_ASSIGNED",
  "TELEGRAM_MESSAGE",
  "META_INSTAGRAM_MESSAGE",
  "META_FACEBOOK_MESSAGE",
];

function prefFor(
  prefs: NotificationPreferencesResponse,
  type: NotificationType,
): { inApp: boolean; browser: boolean; telegram: boolean; mobile: boolean } {
  const row = prefs.types.find((t) => t.type === type);
  return {
    inApp: row?.inApp ?? true,
    browser: row?.browser ?? false,
    telegram: row?.telegram ?? false,
    mobile: row?.mobile ?? false,
  };
}

export default function NotificationSettingsPage() {
  const [role, setRole] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferencesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [me, p] = await Promise.all([authApi.me(), notificationsApi.getPreferences()]);
      setRole(me.user?.role ?? null);
      setPrefs(p);
    } catch (e) {
      setPrefs(null);
      setLoadError(e instanceof Error ? e.message : "Не вдалося завантажити налаштування");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateType = async (
    type: NotificationType,
    patch: Partial<{ inApp: boolean; browser: boolean; telegram: boolean; mobile: boolean }>,
  ) => {
    if (!prefs) return;
    setSaving(true);
    setMsg(null);
    try {
      const current = prefFor(prefs, type);
      const next = await notificationsApi.updatePreferences({
        types: [{ type, ...current, ...patch }],
      });
      setPrefs(next);
      if (patch.browser && typeof Notification !== "undefined" && Notification.permission === "default") {
        await Notification.requestPermission();
      }
      if (patch.browser && typeof localStorage !== "undefined") {
        localStorage.setItem("crm_notifications_browser", patch.browser ? "1" : "0");
      }
      setMsg("Збережено");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Помилка збереження");
    } finally {
      setSaving(false);
    }
  };

  const updateTeam = async (enabled: boolean) => {
    setSaving(true);
    setMsg(null);
    try {
      const next = await notificationsApi.updatePreferences({ teamNotificationsEnabled: enabled });
      setPrefs(next);
      setMsg("Збережено");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Помилка збереження");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/settings" className="text-sm text-blue-600 hover:underline">
          ← Налаштування
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-zinc-900">Сповіщення</h1>
        <p className="text-sm text-zinc-500">Керуйте каналами доставки подій CRM</p>
      </div>

      {loading ? (
        <div className="text-sm text-zinc-500">Завантаження…</div>
      ) : loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-2 text-red-900 underline hover:no-underline"
          >
            Спробувати знову
          </button>
        </div>
      ) : !prefs ? (
        <div className="text-sm text-zinc-500">Немає даних</div>
      ) : (
        <>
      {msg && <p className="text-sm text-zinc-600">{msg}</p>}

      {(role === "LEAD" || role === "ADMIN") && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="font-medium text-zinc-900">Команда</h2>
          <label className="mt-3 flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={prefs.teamNotificationsEnabled}
              disabled={saving}
              onChange={(e) => void updateTeam(e.target.checked)}
            />
            Отримувати копії сповіщень по замовленнях команди
          </label>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-4 py-3 text-sm font-medium text-zinc-900">
          Типи подій
        </div>
        <ul className="divide-y divide-zinc-100">
          {ALL_TYPES.map((type) => {
            const p = prefFor(prefs, type);
            return (
              <li key={type} className="px-4 py-3">
                <div className="text-sm font-medium text-zinc-800">{NOTIFICATION_TYPE_LABELS[type]}</div>
                <div className="mt-2 flex flex-wrap gap-4 text-sm text-zinc-600">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={p.inApp}
                      disabled={saving}
                      onChange={(e) => void updateType(type, { inApp: e.target.checked })}
                    />
                    In-app
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={p.browser}
                      disabled={saving}
                      onChange={(e) => void updateType(type, { browser: e.target.checked })}
                    />
                    Browser push
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={p.telegram}
                      disabled={saving}
                      onChange={(e) => void updateType(type, { telegram: e.target.checked })}
                    />
                    Telegram
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={p.mobile}
                      disabled={saving}
                      onChange={(e) => void updateType(type, { mobile: e.target.checked })}
                    />
                    Мобільний push
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
        </>
      )}
    </div>
  );
}
