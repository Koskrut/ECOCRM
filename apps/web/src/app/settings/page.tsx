"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";

type SystemReleaseResponse = {
  version: string | null;
  gitSha: string | null;
  builtAt: string | null;
  imageTag: string | null;
  update: { mode: string; state: string; message: string };
};

function dash(v: string | null | undefined): string {
  return v != null && v !== "" ? v : "—";
}

export default function SettingsHomePage() {
  const [role, setRole] = useState<string | null>(null);
  const [release, setRelease] = useState<SystemReleaseResponse | null>(null);
  const [releaseError, setReleaseError] = useState<string | null>(null);

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((r) => setRole(r.data?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  useEffect(() => {
    if (role !== "ADMIN") return;
    let cancelled = false;
    setReleaseError(null);
    apiHttp
      .get<SystemReleaseResponse>("/system/release")
      .then((r) => {
        if (!cancelled) setRelease(r.data ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setRelease(null);
          setReleaseError("Could not load release info.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [role]);

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-2 text-2xl font-bold text-zinc-900">Settings</h1>
        <p className="mb-6 text-sm text-zinc-500">Manage system configuration</p>

        {role === "ADMIN" ? (
          <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4 text-sm shadow-sm">
            <div className="font-semibold text-zinc-900">Release</div>
            <p className="mt-1 text-zinc-500">
              Read-only deployment metadata from the API. Updates are done on the server by the
              operator, not from this UI.
            </p>
            {releaseError ? (
              <p className="mt-2 text-red-600">{releaseError}</p>
            ) : release ? (
              <dl className="mt-3 grid gap-1 sm:grid-cols-2">
                <div>
                  <dt className="text-zinc-500">Version</dt>
                  <dd className="font-mono text-zinc-900">{dash(release.version)}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Git SHA</dt>
                  <dd className="font-mono text-zinc-900">{dash(release.gitSha)}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Built at</dt>
                  <dd className="font-mono text-zinc-900">{dash(release.builtAt)}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Image tag</dt>
                  <dd className="font-mono text-zinc-900">{dash(release.imageTag)}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-zinc-400">Loading…</p>
            )}
            {release ? (
              <p className="mt-3 border-t border-zinc-100 pt-3 text-zinc-600">
                {release.update.message}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/settings/access"
            className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:bg-zinc-50"
          >
            <div className="text-sm font-semibold text-zinc-900">Access & Permissions</div>
            <div className="mt-1 text-sm text-zinc-500">
              Manage employee roles (USER / LEAD / MANAGER / ADMIN)
            </div>
          </Link>

          {role === "ADMIN" ? (
            <Link
              href="/settings/pilot-modules"
              className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:bg-zinc-50"
            >
              <div className="text-sm font-semibold text-zinc-900">Pilot modules</div>
              <div className="mt-1 text-sm text-zinc-500">
                Увімкнення / вимкнення pilot-розширень (AI Calls, оплати, Telegram Inbox).
              </div>
            </Link>
          ) : null}

          {role === "ADMIN" ? (
            <Link
              href="/settings/orders-pipeline"
              className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:bg-zinc-50"
            >
              <div className="text-sm font-semibold text-zinc-900">Orders pipeline</div>
              <div className="mt-1 text-sm text-zinc-500">
                Колонки канбану, підписи та дозволені переходи стадій (лише читання для інших ролей
                у UI замовлень).
              </div>
            </Link>
          ) : null}

          {role === "ADMIN" ? (
            <Link
              href="/settings/leads-pipeline"
              className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:bg-zinc-50"
            >
              <div className="text-sm font-semibold text-zinc-900">Leads pipeline</div>
              <div className="mt-1 text-sm text-zinc-500">
                Підписи, порядок, видимість і дозволені переходи між статусами лідів (ADMIN).
              </div>
            </Link>
          ) : null}

          <Link
            href="/settings/exchange-rates"
            className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:bg-zinc-50"
          >
            <div className="text-sm font-semibold text-zinc-900">Exchange rates</div>
            <div className="mt-1 text-sm text-zinc-500">
              UAH and EUR to USD — used for payment conversion
            </div>
          </Link>

          <Link
            href="/settings/fop"
            className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:bg-zinc-50"
          >
            <div className="text-sm font-semibold text-zinc-900">ФОП (банковские счета)</div>
            <div className="mt-1 text-sm text-zinc-500">
              Настройка ID и TOKEN для банковских счетов ФОП. Список используется в Платежах.
            </div>
          </Link>

          <Link
            href="/settings/meta-lead-ads"
            className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:bg-zinc-50"
          >
            <div className="text-sm font-semibold text-zinc-900">Facebook / Meta Lead Ads</div>
            <div className="mt-1 text-sm text-zinc-500">
              Webhook verify token, Page Access Token — for receiving leads from Meta
            </div>
          </Link>

          <Link
            href="/settings/google-maps"
            className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:bg-zinc-50"
          >
            <div className="text-sm font-semibold text-zinc-900">Google Maps</div>
            <div className="mt-1 text-sm text-zinc-500">
              Maps JavaScript API key for visits planning map
            </div>
          </Link>

          <Link
            href="/settings/google-sheet"
            className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:bg-zinc-50"
          >
            <div className="text-sm font-semibold text-zinc-900">Google-таблиця (1С)</div>
            <div className="mt-1 text-sm text-zinc-500">
              Webhook для відправки замовлень у таблицю та прийому номерів документів від 1С
            </div>
          </Link>

          <Link
            href="/settings/ringostat"
            className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:bg-zinc-50"
          >
            <div className="text-sm font-semibold text-zinc-900">Ringostat</div>
            <div className="mt-1 text-sm text-zinc-500">
              Телефония Ringostat: webhook secret, API token и маппинг внутренних линий.
            </div>
          </Link>

          <Link
            href="/settings/outbound-voice"
            className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:bg-zinc-50"
          >
            <div className="text-sm font-semibold text-zinc-900">Outbound voice (AI Calls)</div>
            <div className="mt-1 text-sm text-zinc-500">
              HTTP-провайдер исходящих звонков, секрет вебхука, путь и разбор ответа create-call.
            </div>
          </Link>

          <Link
            href="/settings/telegram"
            className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:bg-zinc-50"
          >
            <div className="text-sm font-semibold text-zinc-900">Telegram Inbox</div>
            <div className="mt-1 text-sm text-zinc-500">
              Bot token, webhook secret and public URL for Inbox
            </div>
          </Link>

          <Link
            href="/settings/store"
            className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:bg-zinc-50"
          >
            <div className="text-sm font-semibold text-zinc-900">Інтернет-магазин</div>
            <div className="mt-1 text-sm text-zinc-500">
              Тема, баннери, контакти, URL CRM для оплати з магазину
            </div>
          </Link>

          <Link
            href="/employees"
            className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:bg-zinc-50"
          >
            <div className="text-sm font-semibold text-zinc-900">Employees</div>
            <div className="mt-1 text-sm text-zinc-500">Manage employees and their roles</div>
          </Link>

          <div className="rounded-lg border border-zinc-200 bg-white p-5 text-sm text-zinc-400">
            More settings coming soon…
          </div>
        </div>
      </div>
    </div>
  );
}
