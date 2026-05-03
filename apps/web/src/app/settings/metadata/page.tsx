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
    { href: "/settings/metadata/custom-fields", title: "Custom fields", desc: "Визначення полів по сутностях CRM" },
    { href: "/settings/metadata/dictionaries", title: "Dictionaries", desc: "Довідники та елементи" },
    { href: "/settings/metadata/layouts", title: "Layouts", desc: "Форми, картки, таблиці, фільтри" },
    { href: "/settings/metadata/workflows", title: "Workflows", desc: "Правила автоматизації" },
    { href: "/settings/metadata/rbac", title: "RBAC catalog", desc: "Ролі та дозволи (каталог + призначення)" },
    { href: "/settings/metadata/custom-entities", title: "Custom entities", desc: "Динамічні сутності та записи" },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold text-zinc-900">Metadata &amp; automation</h1>
        <p className="mt-1 text-sm text-zinc-500">Налаштування ядра CRM через API-проксі `/api/*`.</p>
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
