"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { useModules } from "@/lib/modules/useModules";
import { settingsHrefModuleId } from "@/lib/modules/pathModuleGating";

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
  const { status: modulesStatus, effective: moduleEffective } = useModules();

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

        <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">Core CRM</div>
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
            href="/settings/google-maps"
            className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:bg-zinc-50"
          >
            <div className="text-sm font-semibold text-zinc-900">Google Maps</div>
            <div className="mt-1 text-sm text-zinc-500">
              Maps JavaScript API key for visits planning map
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
            href="/employees"
            className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:bg-zinc-50"
          >
            <div className="text-sm font-semibold text-zinc-900">Employees</div>
            <div className="mt-1 text-sm text-zinc-500">Manage employees and their roles</div>
          </Link>

          {role === "ADMIN" ? (
            <Link
              href="/settings/metadata"
              className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm transition-colors hover:bg-emerald-50"
            >
              <div className="text-sm font-semibold text-emerald-900">Metadata &amp; automation</div>
              <div className="mt-1 text-sm text-emerald-800">
                Поля, словники, макети, workflow, RBAC, custom entities
              </div>
            </Link>
          ) : null}

          {role === "ADMIN" ? (
            <Link
              href="/settings/data-import"
              className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:bg-zinc-50"
            >
              <div className="text-sm font-semibold text-zinc-900">Data import</div>
              <div className="mt-1 text-sm text-zinc-500">CSV імпорт контактів (ядро)</div>
            </Link>
          ) : null}

          {role === "ADMIN" ? (
            <Link
              href="/settings/health"
              className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:bg-zinc-50"
            >
              <div className="text-sm font-semibold text-zinc-900">System health</div>
              <div className="mt-1 text-sm text-zinc-500">Release, license, modules, backend variant</div>
            </Link>
          ) : null}
        </div>

        <div className="mt-10 mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Extensions &amp; integrations
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              { href: "/settings/fop", title: "ФОП (банковские счета)", desc: "Банк / платежи" },
              {
                href: "/settings/google-sheet",
                title: "Google-таблиця (1С)",
                desc: "Webhook для відправки замовлень у таблицю та прийому номерів документів від 1С",
              },
              {
                href: "/settings/ringostat",
                title: "Ringostat",
                desc: "Телефония Ringostat: webhook secret, API token и маппинг внутренних линий.",
              },
              {
                href: "/settings/outbound-voice",
                title: "Outbound voice (AI Calls)",
                desc: "HTTP-провайдер исходящих звонков, секрет вебхука, путь и разбор ответа create-call.",
              },
              {
                href: "/settings/telegram",
                title: "Telegram Inbox",
                desc: "Bot token, webhook secret and public URL for Inbox",
              },
              {
                href: "/settings/store",
                title: "Інтернет-магазин",
                desc: "Тема, баннери, контакти, URL CRM для оплати з магазину",
              },
            ] as const
          )
            .filter((x) => {
              if (modulesStatus !== "ready") return true;
              const mid = settingsHrefModuleId(x.href);
              if (!mid) return true;
              return moduleEffective(mid);
            })
            .map((x) => (
              <Link
                key={x.href}
                href={x.href}
                className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:bg-zinc-50"
              >
                <div className="text-sm font-semibold text-zinc-900">{x.title}</div>
                <div className="mt-1 text-sm text-zinc-500">{x.desc}</div>
              </Link>
            ))}
        </div>
      </div>
    </div>
  );
}
