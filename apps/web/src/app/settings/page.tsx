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
            className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm hover:bg-zinc-50 transition-colors"
          >
            <div className="text-sm font-semibold text-zinc-900">Access & Permissions</div>
            <div className="mt-1 text-sm text-zinc-500">
              Manage employee roles (ADMIN / LEAD / MANAGER)
            </div>
          </Link>

          {/* сюда позже добавим остальные разделы */}
          <div className="rounde-zinc-300 bg-white p-5 text-sm text-zinc-400">
            More settings coming soon…
          </div>
        </div>
      </div>
    </div>
  );
}
