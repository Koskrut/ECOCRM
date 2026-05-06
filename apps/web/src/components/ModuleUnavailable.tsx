"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ShieldOff } from "lucide-react";
import { strings } from "@/locales";

export type ModuleUnavailableVariant = "not-effective" | "api-error";

type ModuleUnavailableProps = {
  variant: ModuleUnavailableVariant;
  /** Module identifier shown to admins as a debugging aid (hidden behind toggle). */
  moduleId?: string;
  onRetry?: () => void;
};

export function ModuleUnavailable({ variant, moduleId, onRetry }: ModuleUnavailableProps) {
  const [showDetails, setShowDetails] = useState(false);
  const isApiError = variant === "api-error";
  const Icon = isApiError ? AlertTriangle : ShieldOff;
  const description = isApiError
    ? strings.modules.unavailableApiError
    : strings.modules.unavailableNotEffective;

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <h1 className="text-xl font-semibold text-zinc-900">{strings.modules.unavailableTitle}</h1>
      <p className="mt-2 text-sm text-zinc-600">{description}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {isApiError && onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50"
          >
            {strings.common.retry}
          </button>
        ) : null}
        <Link
          href="/"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800"
        >
          {strings.common.backToDashboard}
        </Link>
      </div>
      {moduleId ? (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="text-xs text-zinc-400 hover:text-zinc-600"
          >
            {showDetails ? strings.common.hideDetails : strings.common.showDetails}
          </button>
          {showDetails ? (
            <p className="mt-2 font-mono text-xs text-zinc-400">
              {strings.modules.moduleIdLabel}: {moduleId}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ModuleGateSkeleton() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-10">
      <div className="h-6 w-1/3 animate-pulse rounded bg-zinc-200" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-100" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="h-24 animate-pulse rounded-lg bg-zinc-100" />
        <div className="h-24 animate-pulse rounded-lg bg-zinc-100" />
        <div className="h-24 animate-pulse rounded-lg bg-zinc-100" />
        <div className="h-24 animate-pulse rounded-lg bg-zinc-100" />
      </div>
    </div>
  );
}
