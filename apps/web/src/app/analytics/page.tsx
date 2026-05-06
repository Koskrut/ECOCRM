"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BarChart3, Map } from "lucide-react";
import { apiHttp } from "@/lib/api/client";

type MeResponse = { user?: { role?: string } };

export default function AnalyticsPage() {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiHttp
      .get<MeResponse>("/auth/me")
      .then((res) => setRole(res.data?.user?.role ?? null))
      .catch(() => setRole(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
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
        <h1 className="mb-2 flex items-center gap-2 text-2xl font-bold text-zinc-900">
          <BarChart3 className="h-7 w-7 text-zinc-600" />
          Аналітика
        </h1>
        <p className="mb-6 text-sm text-zinc-500">Зведення та візуалізація даних</p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/analytics/map"
            className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:bg-zinc-50"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <Map className="h-5 w-5 text-zinc-600" />
              Карта
            </div>
            <div className="mt-1 text-sm text-zinc-500">
              Інтерактивна карта областей України: клієнти, продажі за період, відповідальні
              менеджери
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
