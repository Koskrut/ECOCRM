"use client";

import { strings } from "@/locales";

type ErrorPanelProps = {
  /** Localized title. */
  title?: string;
  /** Error message; required. */
  message: string;
  /** When provided, renders a Retry button. */
  onRetry?: () => void;
  /** Visual variant: card (default), inline (compact), banner (full-width). */
  variant?: "card" | "inline" | "banner";
  className?: string;
};

export function ErrorPanel({
  title,
  message,
  onRetry,
  variant = "card",
  className,
}: ErrorPanelProps) {
  if (variant === "inline") {
    return (
      <div
        className={`rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 ${className ?? ""}`}
        role="alert"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {title ? <div className="font-medium">{title}</div> : null}
            <div>{message}</div>
          </div>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="shrink-0 rounded border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-50"
            >
              {strings.common.retry}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (variant === "banner") {
    return (
      <div
        className={`rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 ${className ?? ""}`}
        role="alert"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {title ? <div className="font-medium">{title}</div> : null}
            <div>{message}</div>
          </div>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="shrink-0 rounded border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              {strings.common.retry}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm ${className ?? ""}`}
      role="alert"
    >
      {title ? <div className="font-medium text-red-800">{title}</div> : null}
      <div className={title ? "mt-1" : ""}>{message}</div>
      {onRetry ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-50"
          >
            {strings.common.retry}
          </button>
        </div>
      ) : null}
    </div>
  );
}
