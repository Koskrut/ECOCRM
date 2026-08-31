"use client";

import { useState } from "react";
import { scheduleModalClose } from "@/lib/modal/scheduleModalClose";

export type LeadConvertPreset = "company_contact_deal" | "contact_deal" | "contact";

type Props = {
  statusUpdating: boolean;
  onConvert: (preset: LeadConvertPreset) => void;
  onMarkNotTarget: () => void;
  onMarkLost: (reason: string) => void;
  onMarkSpam: () => void;
  onClose: () => void;
};

export function LeadOutcomeDialog({
  statusUpdating,
  onConvert,
  onMarkNotTarget,
  onMarkLost,
  onMarkSpam,
  onClose,
}: Props) {
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState("");

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="complete-outcome-title"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        scheduleModalClose(onClose);
      }}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="complete-outcome-title" className="text-base font-semibold text-zinc-900">
          Оберіть результат завершення ліда
        </h2>

        {lostOpen ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-zinc-600">Вкажіть причину провалу (обовʼязково).</p>
            <textarea
              rows={3}
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="Причина…"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setLostOpen(false)}
                className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                Назад
              </button>
              <button
                type="button"
                disabled={statusUpdating || !lostReason.trim()}
                onClick={() => onMarkLost(lostReason.trim())}
                className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-60"
              >
                Позначити проваленим
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-4 space-y-3">
              <button
                type="button"
                onClick={() => onConvert("company_contact_deal")}
                className="flex w-full items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm font-medium text-emerald-800 hover:bg-emerald-100"
              >
                <span>Компанія + контакт + замовлення</span>
                <span className="text-emerald-600">→</span>
              </button>
              <button
                type="button"
                onClick={() => onConvert("contact_deal")}
                className="flex w-full items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm font-medium text-emerald-800 hover:bg-emerald-100"
              >
                <span>Контакт + замовлення</span>
                <span className="text-emerald-600">→</span>
              </button>
              <button
                type="button"
                onClick={() => onConvert("contact")}
                className="flex w-full items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm font-medium text-emerald-800 hover:bg-emerald-100"
              >
                <span>Лише контакт</span>
                <span className="text-emerald-600">→</span>
              </button>
              <button
                type="button"
                onClick={onMarkNotTarget}
                disabled={statusUpdating}
                className="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-100 disabled:opacity-60"
              >
                <span>Нецільовий лід</span>
                <span className="text-zinc-500">→</span>
              </button>
              <button
                type="button"
                onClick={() => setLostOpen(true)}
                disabled={statusUpdating}
                className="flex w-full items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-left text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-60"
              >
                <span>Провалений</span>
                <span className="text-red-600">→</span>
              </button>
              <button
                type="button"
                onClick={onMarkSpam}
                disabled={statusUpdating}
                className="flex w-full items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
              >
                <span>Спам</span>
                <span className="text-amber-700">→</span>
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                Скасувати
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
