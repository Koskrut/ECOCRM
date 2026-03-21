"use client";

import React from "react";
import type { PublicPayPayload } from "./public-pay.types";

const STATUS_UA: Record<string, string> = {
  PENDING: "Очікує оплату",
  PAID: "Оплачено",
  EXPIRED: "Прострочено",
  CANCELED: "Скасовано",
};

function bannerClass(status: string): string {
  if (status === "PAID") return "pay-public-banner pay-public-banner--paid";
  if (status === "EXPIRED") return "pay-public-banner pay-public-banner--expired";
  return "pay-public-banner pay-public-banner--muted";
}

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
    <div className="pay-public-page">
      <div className="pay-public-inner">
        <div className="pay-public-head">
          <h1>Оплата за реквізитами</h1>
          <p>ECOCRM — безпечне посилання на оплату</p>
        </div>

        {error ? (
          <div className="pay-public-err">{error}</div>
        ) : data ? (
          <div className="pay-public-card">
            <div className="pay-public-center">
              <div className="pay-public-label-xs">Статус</div>
              <div className="pay-public-status">{STATUS_UA[data.effectiveStatus] ?? data.effectiveStatus}</div>
            </div>

            {data.effectiveStatus !== "PENDING" ? (
              <div className={bannerClass(data.effectiveStatus)}>
                {data.effectiveStatus === "EXPIRED"
                  ? "Термін дії цього посилання минув. Реквізити нижче збережені для довідки."
                  : data.effectiveStatus === "CANCELED"
                    ? "Це посилання скасовано. Реквізити нижче збережені для довідки."
                    : data.effectiveStatus === "PAID"
                      ? "Оплату зафіксовано в CRM."
                      : null}
              </div>
            ) : null}

            <div className="pay-public-sumwrap">
              <div className="pay-public-label-xs">Сума</div>
              <div className="pay-public-amount">
                {data.amount.toFixed(2)} {data.currency}
              </div>
            </div>

            <div className="pay-public-fields">
              <div>
                <div className="pay-public-field-label">Отримувач</div>
                <div className="pay-public-field-val">{data.recipientName}</div>
              </div>
              <div>
                <div className="pay-public-field-label">IBAN</div>
                <div className="pay-public-field-val pay-public-mono">{data.iban}</div>
              </div>
              {data.edrpou ? (
                <div>
                  <div className="pay-public-field-label">ЄДРПОУ / ІПН</div>
                  <div className="pay-public-field-val">{data.edrpou}</div>
                </div>
              ) : null}
              {data.mfo ? (
                <div>
                  <div className="pay-public-field-label">МФО</div>
                  <div className="pay-public-field-val">{data.mfo}</div>
                </div>
              ) : null}
              <div>
                <div className="pay-public-field-label">Призначення платежу</div>
                <div className="pay-public-field-val pay-public-purpose">{data.purpose}</div>
              </div>
              <div className="pay-public-muted-xs">Дійсно до: {new Date(data.expiresAt).toLocaleString("uk-UA")}</div>
            </div>

            {data.effectiveStatus === "PENDING" ? (
              <div className="pay-public-actions">
                <a href={data.nbuDeeplink} className="pay-public-btn-pay">
                  Оплатити в банківському додатку
                </a>
                <div className="pay-public-row">
                  <button type="button" onClick={() => void copy(data.iban)} className="pay-public-btn-sec">
                    Копіювати IBAN
                  </button>
                  <button type="button" onClick={() => void copy(data.purpose)} className="pay-public-btn-sec">
                    Копіювати призначення
                  </button>
                </div>
              </div>
            ) : (
              <div className="pay-public-row">
                <button type="button" onClick={() => void copy(data.iban)} className="pay-public-btn-sec">
                  Копіювати IBAN
                </button>
                <button type="button" onClick={() => void copy(data.purpose)} className="pay-public-btn-sec">
                  Копіювати призначення
                </button>
              </div>
            )}

            {data.qrPngDataUrl ? (
              <div className="pay-public-qr">
                <div className="pay-public-field-label">QR для сканування</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={data.qrPngDataUrl} alt="QR" />
              </div>
            ) : null}
          </div>
        ) : (
          <p className="pay-public-fallback">
            Не вдалося показати дані.{" "}
            <button type="button" onClick={() => window.location.reload()}>
              Оновити сторінку
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
