"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Map as MapIcon, ArrowLeft } from "lucide-react";
import { apiHttp } from "@/lib/api/client";
import { UkraineOblastMap } from "@/components/maps/UkraineOblastMap";

type MeResponse = { user?: { role?: string } };

export default function AnalyticsMapPage() {
  const [role, setRole] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    apiHttp
      .get<MeResponse>("/auth/me")
      .then((res) => setRole(res.data?.user?.role ?? null))
      .catch(() => setRole(null))
      .finally(() => setRoleLoading(false));
  }, []);

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 p-6">
        <div className="mx-auto max-w-6xl">
          <div className="animate-pulse rounded-lg bg-zinc-200 py-8" />
        </div>
      </div>
    );
  }

  if (role !== "ADMIN") {
    return (
      <div className="min-h-screen bg-zinc-50 p-6">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
            <h1 className="text-xl font-semibold text-zinc-900">Доступ заборонено</h1>
            <p className="mt-2 text-sm text-zinc-600">
              Розділ «Аналітика» доступний лише для адміністратора.
            </p>
            <Link
              href="/"
              className="mt-4 inline-block text-sm font-medium text-accent-600 hover:underline"
            >
              На головну
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-xl">
          <h1 className="mb-2 flex items-center gap-2 text-2xl font-bold text-zinc-900">
            <MapIcon className="h-7 w-7 text-zinc-600" />
            Карта
          </h1>
          <p className="mb-8 text-sm text-zinc-600">
            Інтерактивна карта областей: два відділи продажів, зум по кліку на відділ або область,
            дані з аналітики за місяць.
          </p>
          <UkraineOblastMap />
          <Link
            href="/analytics"
            className="mt-10 inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Назад до аналітики
          </Link>
        </div>
      </div>
    </div>
  );
}
