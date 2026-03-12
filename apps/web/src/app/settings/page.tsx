"use client";

import Link from "next/link";

export default function SettingsHomePage() {
  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-2 text-2xl font-bold text-zinc-900">Settings</h1>
        <p className="mb-6 text-sm text-zinc-500">Manage system configuration</p>

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
            href="/settings/ringostat"
            className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:bg-zinc-50"
          >
            <div className="text-sm font-semibold text-zinc-900">Ringostat</div>
            <div className="mt-1 text-sm text-zinc-500">
              Телефония Ringostat: webhook secret, API token и маппинг внутренних линий.
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
              Тема, баннери на головній та контакти для магазину
            </div>
          </Link>

          <Link
            href="/employees"
            className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:bg-zinc-50"
          >
            <div className="text-sm font-semibold text-zinc-900">Employees</div>
            <div className="mt-1 text-sm text-zinc-500">
              Manage employees and their roles
            </div>
          </Link>

          <div className="rounded-lg border border-zinc-200 bg-white p-5 text-sm text-zinc-400">
            More settings coming soon…
          </div>
        </div>
      </div>
    </div>
  );
}
