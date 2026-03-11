"use client";

import { useEffect, useState } from "react";
import { getMe, patchMe } from "@/lib/api";
import { Button } from "@/components/Button";

const inputClass =
  "mt-1 w-full min-h-[44px] rounded-lg border border-[var(--border)] bg-white px-3 py-2.5 text-zinc-900 outline-none transition focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]";

export default function CabinetProfilePage() {
  const [me, setMe] = useState<Awaited<ReturnType<typeof getMe>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "" });

  useEffect(() => {
    getMe()
      .then((data) => {
        setMe(data);
        setForm({
          firstName: data.firstName ?? "",
          lastName: data.lastName ?? "",
          email: data.email ?? "",
        });
      })
      .catch(() => setErr("Не вдалося завантажити профіль"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveErr(null);
    setSaving(true);
    try {
      const updated = await patchMe({
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
        email: form.email.trim() || null,
      });
      setMe(updated);
      setEditing(false);
    } catch {
      setSaveErr("Не вдалося зберегти зміни");
    } finally {
      setSaving(false);
    }
  };

  if (err) {
    return (
      <div>
        <p className="text-red-600">{err}</p>
      </div>
    );
  }

  if (loading || !me) {
    return (
      <div>
        <div className="h-8 w-48 animate-pulse rounded bg-zinc-200" />
        <div className="mt-6 h-48 animate-pulse rounded-xl bg-zinc-200" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-heading text-xl font-semibold text-zinc-900 sm:text-2xl">
        Профіль
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Ваші контактні дані. Телефон змінити в кабінеті неможливо — зверніться до нас.
      </p>

      <div className="mt-6 rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
        {editing ? (
          <form onSubmit={handleSave} className="space-y-4">
            {saveErr && <p className="text-sm text-red-600">{saveErr}</p>}
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Ім&apos;я
              </label>
              <input
                type="text"
                className={inputClass}
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                maxLength={120}
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Прізвище
              </label>
              <input
                type="text"
                className={inputClass}
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                maxLength={120}
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Email
              </label>
              <input
                type="email"
                className={inputClass}
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                maxLength={255}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Збереження…" : "Зберегти"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setEditing(false);
                  setForm({
                    firstName: me.firstName ?? "",
                    lastName: me.lastName ?? "",
                    email: me.email ?? "",
                  });
                  setSaveErr(null);
                }}
                disabled={saving}
              >
                Скасувати
              </Button>
            </div>
          </form>
        ) : (
          <>
            <dl className="space-y-4">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Ім&apos;я
                </dt>
                <dd className="mt-1 text-zinc-900">
                  {me.firstName} {me.lastName}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Телефон
                </dt>
                <dd className="mt-1 text-zinc-900">{me.phone || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Email
                </dt>
                <dd className="mt-1 text-zinc-900">{me.email || "—"}</dd>
              </div>
              {me.telegramLinked && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                    Telegram
                  </dt>
                  <dd className="mt-1 text-zinc-900">
                    {me.telegramUsername ? `@${me.telegramUsername}` : "Підключено"}
                  </dd>
                </div>
              )}
            </dl>
            <Button
              type="button"
              variant="secondary"
              className="mt-4"
              onClick={() => setEditing(true)}
            >
              Редагувати
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
