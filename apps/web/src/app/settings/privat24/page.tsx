"use client";

import Link from "next/link";
import { strings } from "@/locales";

export default function Privat24SettingsPage() {
  const s = strings.settings.privat24;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/settings" className="text-sm text-zinc-500 hover:text-zinc-700">
        {strings.common.backToSettings}
      </Link>
      <h1 className="text-2xl font-semibold text-zinc-900">{s.title}</h1>
      <p className="text-sm text-zinc-600">{s.desc}</p>
      <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-700">
        <li>{s.hintAutoclient}</li>
        <li>{s.hintIban}</li>
        <li>
          {s.hintAccounts}{" "}
          <Link href="/settings/bank" className="text-blue-600 underline">
            {s.bankLink}
          </Link>
        </li>
      </ul>
    </div>
  );
}
