"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { strings } from "@/locales";

type SettingsPageShellProps = {
  title: string;
  subtitle?: string;
  maxWidthClassName?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function SettingsPageShell({
  title,
  subtitle,
  maxWidthClassName = "max-w-2xl",
  actions,
  children,
}: SettingsPageShellProps) {
  return (
    <div className={`mx-auto w-full ${maxWidthClassName}`}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/settings"
            className="inline-flex items-center text-sm text-zinc-600 hover:text-zinc-900"
          >
            ← {strings.common.backToSettings}
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-zinc-500">{subtitle}</p> : null}
        </div>
        {actions ? <div>{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}
