"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";

export default function MetadataSettingsHubPage() {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((r) => setRole(r.data?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  if (role !== "ADMIN") {
    return (
      <div className="min-h-screen bg-zinc-50 p-6">
        <p className="text-sm text-zinc-600">Доступ тільки для ADMIN.</p>
      </div>
    );
  }

  const catalogLinks = [
    {
      href: "/settings/catalog/characteristics",
      title: "Характеристики товару",
      desc: "Коди й підписи властивостей каталогу (діаметр, система, матеріал…)",
    },
    {
      href: "/settings/store",
      title: "Інтернет-магазин",
      desc: "Тема, банери, URL вітрини",
    },
  ];

  const crmLinks = [
    { href: "/settings/metadata/custom-fields", title: "Користувацькі поля", desc: "Поля для компаній, контактів, замовлень, лідів" },
    { href: "/settings/metadata/dictionaries", title: "CRM-довідники", desc: "Регіони, канали та інші списки для кастомних полів" },
    { href: "/settings/metadata/layouts", title: "Макети інтерфейсу", desc: "Форми, картки, таблиці, фільтри" },
    {
      href: "/settings/metadata/list-columns",
      title: "Колонки списків",
      desc: "Додаткові колонки в списках компаній, контактів, замовлень і лідів",
    },
    {
      href: "/settings/metadata/list-filters",
      title: "Фільтри списків",
      desc: "Які додаткові поля показувати у фільтрі списків",
    },
    { href: "/settings/metadata/workflows", title: "Автоматизації", desc: "Правила автоматизації процесів" },
    { href: "/settings/metadata/rbac", title: "Ролі та дозволи", desc: "Каталог ролей і призначення прав" },
    { href: "/settings/metadata/custom-entities", title: "Користувацькі сутності", desc: "Динамічні сутності та їх записи" },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-4xl">
        <Link href="/settings" className="text-sm text-zinc-600 hover:text-zinc-900">
          ← Налаштування
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">Метадані та автоматизація</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Каталог окремо від платформних налаштувань CRM (поля, RBAC, workflow).
        </p>

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-500">Каталог і вітрина</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {catalogLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg border border-emerald-200 bg-white p-4 shadow-sm transition-colors hover:bg-emerald-50/40"
            >
              <div className="text-sm font-semibold text-zinc-900">{l.title}</div>
              <div className="mt-1 text-xs text-zinc-500">{l.desc}</div>
            </Link>
          ))}
        </div>

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-500">Платформа CRM</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {crmLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition-colors hover:bg-zinc-50"
            >
              <div className="text-sm font-semibold text-zinc-900">{l.title}</div>
              <div className="mt-1 text-xs text-zinc-500">{l.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
