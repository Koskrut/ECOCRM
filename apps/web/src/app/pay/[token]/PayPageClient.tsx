"use client";

import React, { useEffect, useState } from "react";

type PublicPayPayload = {
  status: string;
  effectiveStatus: string;
  amount: number;
  currency: string;
  purpose: string;
  expiresAt: string;
  recipientName: string;
  iban: string;
  edrpou: string | null;
  mfo: string | null;
  bankName: string | null;
  nbuDeeplink: string;
  qrPngDataUrl: string;
};

const STATUS_UA: Record<string, string> = {
  PENDING: "Очікує оплату",
  PAID: "Оплачено",
  EXPIRED: "Прострочено",
  CANCELED: "Скасовано",
};

export function PayPageClient({ token }: { token: string }) {
  const [data, setData] = useState<PublicPayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), 35_000);
      const apiPath = `/api/public/payment-requests/${encodeURIComponent(token)}`;
      const fetchUrl =
        typeof window !== "undefined" ? `${window.location.origin}${apiPath}` : apiPath;
      // #region agent log
      void fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "c6a409" },
        body: JSON.stringify({
          sessionId: "c6a409",
          hypothesisId: "H2",
          location: "PayPageClient.tsx:fetchStart",
          message: "public pay fetch",
          data: { tokenLen: token.length, fetchUrlLen: fetchUrl.length, origin: typeof window !== "undefined" ? window.location.origin : "" },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      try {
        const r = await fetch(fetchUrl, {
          cache: "no-store",
          credentials: "omit",
          signal: ac.signal,
        });
        // #region agent log
        void fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "c6a409" },
          body: JSON.stringify({
            sessionId: "c6a409",
            hypothesisId: "H2",
            location: "PayPageClient.tsx:fetchDone",
            message: "public pay response",
            data: { ok: r.ok, status: r.status },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        if (!r.ok) {
          if (r.status === 404) {
            setError("Посилання не знайдено.");
          } else {
            setError((await r.text()) || `Помилка ${r.status}`);
          }
          setData(null);
          return;
        }
        const j = (await r.json()) as PublicPayPayload;
        if (!cancelled) setData(j);
      } catch (e) {
        // #region agent log
        void fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "c6a409" },
          body: JSON.stringify({
            sessionId: "c6a409",
            hypothesisId: "H2",
            location: "PayPageClient.tsx:fetchCatch",
            message: "public pay error",
            data: {
              name: e instanceof Error ? e.name : "unknown",
              msg: e instanceof Error ? String(e.message).slice(0, 120) : "non-Error",
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        if (!cancelled) {
          const aborted = e instanceof Error && e.name === "AbortError";
          setError(
            aborted
              ? "Час очікування вичерпано. Перевірте зв’язок і оновіть сторінку."
              : e instanceof Error
                ? e.message
                : "Помилка мережі",
          );
        }
      } finally {
        clearTimeout(tid);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="min-h-dvh bg-zinc-50 px-4 py-8 text-zinc-900">
      <div className="mx-auto max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold tracking-tight">Оплата за реквізитами</h1>
          <p className="mt-1 text-xs text-zinc-500">ECOCRM — безпечне посилання на оплату</p>
        </div>

        {loading ? (
          <p className="text-center text-sm text-zinc-500">Завантаження…</p>
        ) : error ? (
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
