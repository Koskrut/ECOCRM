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

  const links = [
    { href: "/settings/metadata/custom-fields", title: "Користувацькі поля", desc: "Визначення полів для сутностей CRM" },
    { href: "/settings/metadata/dictionaries", title: "Довідники", desc: "Списки значень та елементи" },
    { href: "/settings/metadata/layouts", title: "Макети інтерфейсу", desc: "Форми, картки, таблиці, фільтри" },
    {
      href: "/settings/metadata/list-columns",
      title: "Колонки списків",
      desc: "Додаткові колонки в списках компаній, контактів, замовлень і лідів",
    },
    { href: "/settings/metadata/workflows", title: "Автоматизації", desc: "Правила автоматизації процесів" },
    { href: "/settings/metadata/rbac", title: "Ролі та дозволи", desc: "Каталог ролей і призначення прав" },
    { href: "/settings/metadata/custom-entities", title: "Користувацькі сутності", desc: "Динамічні сутності та їх записи" },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold text-zinc-900">Метадані та автоматизація</h1>
        <p className="mt-1 text-sm text-zinc-500">Розширені налаштування структури CRM і бізнес-правил.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {links.map((l) => (
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
