"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";

type StoreTheme = {
  primary?: string;
  primaryHover?: string;
  surface?: string;
  border?: string;
};

type StoreBanner = {
  id: string;
  title: string;
  subtitle?: string;
  ctaText?: string;
  ctaHref?: string;
  imageUrl?: string;
  order: number;
};

type StoreContact = {
  companyName?: string;
  address?: string;
  phone?: string;
  email?: string;
};

type StoreConfig = {
  theme?: StoreTheme;
  banners?: StoreBanner[];
  contact?: StoreContact;
};

function getApiErrorMessage(e: unknown, fallback: string) {
  const msg =
    (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data
      ?.message ??
    (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.error;
  return msg ?? (e instanceof Error ? e.message : fallback);
}

function newBanner(order: number): StoreBanner {
  return {
    id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    title: "",
    subtitle: "",
    ctaText: "",
    ctaHref: "",
    imageUrl: "",
    order,
  };
}

export default function StoreSettingsPage() {
  const [config, setConfig] = useState<StoreConfig>({
    theme: { primary: "#1e3a5f", primaryHover: "#152a47", surface: "#f8fafc", border: "#e2e8f0" },
    banners: [],
    contact: {},
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiHttp.get<StoreConfig>("/settings/store");
      const data = res.data;
      if (data) {
        setConfig({
          theme: data.theme ?? { primary: "#1e3a5f", primaryHover: "#152a47", surface: "#f8fafc", border: "#e2e8f0" },
          banners: Array.isArray(data.banners) ? [...data.banners].sort((a, b) => a.order - b.order) : [],
          contact: data.contact ?? {},
        });
      }
    } catch (e) {
      setError(getApiErrorMessage(e, "Не вдалося завантажити налаштування"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await apiHttp.patch<StoreConfig>("/settings/store", config);
      if (res.data) setConfig(res.data);
    } catch (e) {
      setError(getApiErrorMessage(e, "Не вдалося зберегти"));
    } finally {
      setSaving(false);
    }
  }

  function setTheme(partial: Partial<StoreTheme>) {
    setConfig((c) => ({ ...c, theme: { ...c.theme, ...partial } }));
  }

  function setContact(partial: Partial<StoreContact>) {
    setConfig((c) => ({ ...c, contact: { ...c.contact, ...partial } }));
  }

  function setBanner(id: string, partial: Partial<StoreBanner>) {
    setConfig((c) => ({
      ...c,
      banners: (c.banners ?? []).map((b) => (b.id === id ? { ...b, ...partial } : b)),
    }));
  }

  function addBanner() {
    const banners = config.banners ?? [];
    const nextOrder = banners.length ? Math.max(...banners.map((b) => b.order), 0) + 1 : 0;
    setConfig((c) => ({ ...c, banners: [...(c.banners ?? []), newBanner(nextOrder)] }));
  }

  function removeBanner(id: string) {
    setConfig((c) => ({ ...c, banners: (c.banners ?? []).filter((b) => b.id !== id) }));
  }

  function moveBanner(id: string, delta: number) {
    const banners = [...(config.banners ?? [])];
    const i = banners.findIndex((b) => b.id === id);
    if (i === -1 || i + delta < 0 || i + delta >= banners.length) return;
    const j = i + delta;
    [banners[i], banners[j]] = [banners[j], banners[i]];
    banners.forEach((b, idx) => {
      b.order = idx;
    });
    setConfig((c) => ({ ...c, banners }));
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <Link
            href="/settings"
            className="inline-flex items-center text-sm text-zinc-600 hover:text-zinc-900"
          >
            ← Назад до налаштувань
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">Інтернет-магазин</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Тема, баннери на головній сторінці та контакти для магазину
          </p>
        </div>

        {error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-zinc-500">Завантаження…</p>
        ) : (
          <div className="space-y-6">
            {/* Theme */}
            <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-900">Тема (кольори)</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-zinc-600">Основний колір (Primary)</label>
                  <div className="mt-1 flex gap-2">
                    <input
                      type="color"
                      value={config.theme?.primary ?? "#1e3a5f"}
                      onChange={(e) => setTheme({ primary: e.target.value })}
                      className="h-10 w-14 cursor-pointer rounded border border-zinc-300"
                    />
                    <input
                      type="text"
                      value={config.theme?.primary ?? ""}
                      onChange={(e) => setTheme({ primary: e.target.value })}
                      className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                      placeholder="#1e3a5f"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-600">Primary (при наведенні)</label>
                  <div className="mt-1 flex gap-2">
                    <input
                      type="color"
                      value={config.theme?.primaryHover ?? "#152a47"}
                      onChange={(e) => setTheme({ primaryHover: e.target.value })}
                      className="h-10 w-14 cursor-pointer rounded border border-zinc-300"
                    />
                    <input
                      type="text"
                      value={config.theme?.primaryHover ?? ""}
                      onChange={(e) => setTheme({ primaryHover: e.target.value })}
                      className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                      placeholder="#152a47"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Banners */}
            <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-900">Баннери на головній</h2>
                <button
                  type="button"
                  onClick={addBanner}
                  className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  Додати баннер
                </button>
              </div>
              <div className="mt-4 space-y-4">
                {(config.banners ?? []).map((banner, index) => (
                  <div
                    key={banner.id}
                    className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-medium text-zinc-500">Баннер {index + 1}</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => moveBanner(banner.id, -1)}
                          disabled={index === 0}
                          className="rounded p-1.5 text-zinc-500 hover:bg-zinc-200 disabled:opacity-30"
                          title="Вгору"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveBanner(banner.id, 1)}
                          disabled={index === (config.banners ?? []).length - 1}
                          className="rounded p-1.5 text-zinc-500 hover:bg-zinc-200 disabled:opacity-30"
                          title="Вниз"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removeBanner(banner.id)}
                          className="rounded p-1.5 text-red-600 hover:bg-red-50"
                          title="Видалити"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-zinc-500">Заголовок</label>
                        <input
                          type="text"
                          value={banner.title}
                          onChange={(e) => setBanner(banner.id, { title: e.target.value })}
                          className="mt-0.5 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                          placeholder="Титанові платформи"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-500">Підзаголовок</label>
                        <input
                          type="text"
                          value={banner.subtitle ?? ""}
                          onChange={(e) => setBanner(banner.id, { subtitle: e.target.value })}
                          className="mt-0.5 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                          placeholder="Короткий опис"
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-medium text-zinc-500">Текст кнопки</label>
                          <input
                            type="text"
                            value={banner.ctaText ?? ""}
                            onChange={(e) => setBanner(banner.id, { ctaText: e.target.value })}
                            className="mt-0.5 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                            placeholder="Перейти в каталог"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-zinc-500">Посилання кнопки</label>
                          <input
                            type="text"
                            value={banner.ctaHref ?? ""}
                            onChange={(e) => setBanner(banner.id, { ctaHref: e.target.value })}
                            className="mt-0.5 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                            placeholder="#catalog або /?search=..."
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-500">URL зображення (необов’язково)</label>
                        <input
                          type="text"
                          value={banner.imageUrl ?? ""}
                          onChange={(e) => setBanner(banner.id, { imageUrl: e.target.value })}
                          className="mt-0.5 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                          placeholder="https://..."
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {(config.banners ?? []).length === 0 && (
                  <p className="text-sm text-zinc-500">Немає баннерів. Додайте хоча б один.</p>
                )}
              </div>
            </section>

            {/* Contact */}
            <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-900">Контакти (шапка та футер)</h2>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-600">Назва компанії</label>
                  <input
                    type="text"
                    value={config.contact?.companyName ?? ""}
                    onChange={(e) => setContact({ companyName: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                    placeholder="SUPREX"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-600">Адреса</label>
                  <input
                    type="text"
                    value={config.contact?.address ?? ""}
                    onChange={(e) => setContact({ address: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                    placeholder="Дніпро, просп. Б. Хмельницкого 147"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-600">Телефон</label>
                  <input
                    type="text"
                    value={config.contact?.phone ?? ""}
                    onChange={(e) => setContact({ phone: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                    placeholder="+380673597488"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-600">Email</label>
                  <input
                    type="email"
                    value={config.contact?.email ?? ""}
                    onChange={(e) => setContact({ email: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                    placeholder="[email protected]"
                  />
                </div>
              </div>
            </section>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {saving ? "Збереження…" : "Зберегти"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
