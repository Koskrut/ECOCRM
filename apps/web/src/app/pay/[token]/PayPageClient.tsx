"use client";

import React from "react";
import type { PublicPayPayload } from "./public-pay.types";

const STATUS_UA: Record<string, string> = {
  PENDING: "Очікує оплату",
  PAID: "Оплачено",
  EXPIRED: "Прострочено",
  CANCELED: "Скасовано",
};

export function PayPageClient({
  initialData,
  initialError,
}: {
  initialData: PublicPayPayload | null;
  initialError: string | null;
}) {
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  const data = initialData;
  const error = initialError;

  return (
    <div className="min-h-dvh bg-zinc-50 px-4 py-8 text-zinc-900">
      <div className="mx-auto max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold tracking-tight">Оплата за реквізитами</h1>
          <p className="mt-1 text-xs text-zinc-500">ECOCRM — безпечне посилання на оплату</p>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-800">{error}</div>
        ) : data ? (
          <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="text-center">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Статус</div>
              <div className="mt-1 text-base font-semibold text-zinc-900">
                {STATUS_UA[data.effectiveStatus] ?? data.effectiveStatus}
              </div>
            </div>

            {data.effectiveStatus !== "PENDING" ? (
              <div
                className={`rounded-lg px-3 py-2 text-center text-xs ${
                  data.effectiveStatus === "PAID"
                    ? "bg-emerald-50 text-emerald-900"
                    : data.effectiveStatus === "EXPIRED"
                      ? "bg-amber-50 text-amber-900"
                      : "bg-zinc-100 text-zinc-700"
                }`}
              >
                {data.effectiveStatus === "EXPIRED"
                  ? "Термін дії цього посилання минув. Реквізити нижче збережені для довідки."
                  : data.effectiveStatus === "CANCELED"
                    ? "Це посилання скасовано. Реквізити нижче збережені для довідки."
                    : data.effectiveStatus === "PAID"
                      ? "Оплату зафіксовано в CRM."
                      : null}
              </div>
            ) : null}

            <div className="rounded-lg bg-emerald-50/90 px-4 py-3 text-center">
              <div className="text-xs text-emerald-800">Сума</div>
              <div className="text-2xl font-bold tabular-nums text-emerald-950">
                {data.amount.toFixed(2)} {data.currency}
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div>
                <div className="text-xs font-medium text-zinc-500">Отримувач</div>
                <div className="mt-0.5">{data.recipientName}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-zinc-500">IBAN</div>
                <div className="mt-0.5 break-all font-mono text-xs">{data.iban}</div>
              </div>
              {data.edrpou ? (
                <div>
                  <div className="text-xs font-medium text-zinc-500">ЄДРПОУ / ІПН</div>
                  <div className="mt-0.5">{data.edrpou}</div>
                </div>
              ) : null}
              {data.mfo ? (
                <div>
                  <div className="text-xs font-medium text-zinc-500">МФО</div>
                  <div className="mt-0.5">{data.mfo}</div>
                </div>
              ) : null}
              <div>
                <div className="text-xs font-medium text-zinc-500">Призначення платежу</div>
                <div className="mt-0.5 whitespace-pre-wrap">{data.purpose}</div>
              </div>
              <div className="text-xs text-zinc-400">
                Дійсно до: {new Date(data.expiresAt).toLocaleString("uk-UA")}
              </div>
            </div>

            {data.effectiveStatus === "PENDING" ? (
              <div className="flex flex-col gap-2">
                <a
                  href={data.nbuDeeplink}
                  className="flex w-full items-center justify-center rounded-xl bg-emerald-700 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-emerald-800"
                >
                  Оплатити в банківському додатку
                </a>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void copy(data.iban)}
                    className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-100"
                  >
                    Копіювати IBAN
                  </button>
                  <button
                    type="button"
                    onClick={() => void copy(data.purpose)}
                    className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-100"
                  >
                    Копіювати призначення
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copy(data.iban)}
                  className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-100"
                >
                  Копіювати IBAN
                </button>
                <button
                  type="button"
                  onClick={() => void copy(data.purpose)}
                  className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-100"
                >
                  Копіювати призначення
                </button>
              </div>
            )}

            {data.qrPngDataUrl ? (
              <div className="flex flex-col items-center gap-2 border-t border-zinc-100 pt-4">
                <div className="text-xs font-medium text-zinc-500">QR для сканування</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={data.qrPngDataUrl} alt="QR" className="h-48 w-48 rounded-lg border border-zinc-200 bg-white p-2" />
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-center text-sm text-zinc-500">
            Не вдалося показати дані.{" "}
            <button
              type="button"
              className="font-medium text-emerald-800 underline underline-offset-2"
              onClick={() => window.location.reload()}
            >
              Оновити сторінку
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
