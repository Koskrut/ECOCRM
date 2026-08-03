"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fieldFuelApi,
  type FuelRefuelEntry,
} from "@/lib/api/resources/field-fuel";
import { compressReceiptImage } from "@/lib/image/compress-receipt-image";

type FuelRefuelListProps = {
  items: FuelRefuelEntry[];
  canDelete?: boolean;
  onDelete?: (id: string) => Promise<void>;
};

function formatMoney(v: number): string {
  return `${v.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} грн`;
}

export function FuelRefuelList({ items, canDelete, onDelete }: FuelRefuelListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">Заправок ще немає.</p>;
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex gap-3 rounded-lg border border-zinc-200 bg-white p-3">
          <a
            href={fieldFuelApi.refuelReceiptUrl(item.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="block h-20 w-20 shrink-0 overflow-hidden rounded-md border border-zinc-100 bg-zinc-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fieldFuelApi.refuelReceiptUrl(item.id)}
              alt={item.receiptFileName}
              className="h-full w-full object-cover"
            />
          </a>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-zinc-900">
              {item.liters} л · {formatMoney(item.amount)}
            </div>
            <div className="text-xs text-zinc-500">
              {item.liters > 0
                ? `${(item.amount / item.liters).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} грн/л`
                : "—"}
            </div>
            <div className="mt-1 text-xs text-zinc-400">
              {new Date(item.createdAt).toLocaleString("uk-UA")}
            </div>
            {canDelete && onDelete ? (
              <button
                type="button"
                disabled={deletingId === item.id}
                onClick={() => {
                  setDeletingId(item.id);
                  void onDelete(item.id).finally(() => setDeletingId(null));
                }}
                className="mt-2 text-xs font-medium text-red-600 hover:underline disabled:opacity-50">
                Видалити
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

type FuelRefuelModalProps = {
  date: string;
  ownerId?: string;
  onClose: () => void;
  onCreated: () => void;
};

export function FuelRefuelModal({ date, ownerId, onClose, onCreated }: FuelRefuelModalProps) {
  const [liters, setLiters] = useState("");
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [updateProfilePrice, setUpdateProfilePrice] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const litersNum = Number(liters.replace(",", "."));
  const amountNum = Number(amount.replace(",", "."));
  const impliedPricePerLiter =
    Number.isFinite(litersNum) &&
    litersNum > 0 &&
    Number.isFinite(amountNum) &&
    amountNum > 0
      ? amountNum / litersNum
      : null;

  const canSubmit = useMemo(() => {
    return (
      Boolean(file) &&
      Number.isFinite(litersNum) &&
      litersNum > 0 &&
      Number.isFinite(amountNum) &&
      amountNum > 0
    );
  }, [file, litersNum, amountNum]);

  const submit = async () => {
    if (!file || !canSubmit) return;
    setSaving(true);
    setErr(null);
    try {
      const prepared = await compressReceiptImage(file);
      await fieldFuelApi.createRefuel(
        date,
        {
          liters: litersNum,
          amount: amountNum,
          file: prepared,
        },
        ownerId,
      );
      if (updateProfilePrice && impliedPricePerLiter != null && !ownerId) {
        await fieldFuelApi.updateProfile({
          fuelPricePerLiter: Math.round(impliedPricePerLiter * 100) / 100,
        });
      }
      onCreated();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Помилка");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg">
        <h2 className="text-lg font-semibold text-zinc-900">Чек заправки</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Реальна витрата з чека. Не змінює компенсацію км автоматично.
        </p>
        {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
        <div className="mt-4 space-y-3 text-sm">
          <div>
            <label className="text-xs font-medium text-zinc-600">Літри</label>
            <input
              type="number"
              min="0"
              step="0.001"
              value={liters}
              onChange={(e) => setLiters(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-200 px-2 py-1.5"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-600">Сума, грн</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-200 px-2 py-1.5"
            />
          </div>
          {impliedPricePerLiter != null ? (
            <p className="rounded border border-zinc-100 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-700">
              Ціна з чека:{" "}
              <span className="font-semibold">
                {impliedPricePerLiter.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} грн/л
              </span>
            </p>
          ) : null}
          {!ownerId ? (
            <label className="flex items-start gap-2 text-xs text-zinc-700">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={updateProfilePrice}
                onChange={(e) => setUpdateProfilePrice(e.target.checked)}
                disabled={impliedPricePerLiter == null}
              />
              <span>
                Оновити ціну в профілі (для оцінки компенсації км). Лише за вашою згодою — не
                застосовується автоматично.
              </span>
            </label>
          ) : null}
          <div>
            <label className="text-xs font-medium text-zinc-600">Фото чека</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-xs"
            />
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Preview"
                className="mt-2 h-32 w-full rounded-md border border-zinc-100 object-contain"
              />
            ) : null}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-zinc-600">
            Скасувати
          </button>
          <button
            type="button"
            disabled={!canSubmit || saving}
            onClick={() => void submit()}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {saving ? "Збереження…" : "Провести заправку"}
          </button>
        </div>
      </div>
    </div>
  );
}
