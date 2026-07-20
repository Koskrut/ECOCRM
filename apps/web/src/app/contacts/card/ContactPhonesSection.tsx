"use client";

import { useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { formatPhoneDisplay } from "@/lib/formatPhone";

export type ContactPhone = {
  id: string;
  phone: string;
  phoneNormalized: string;
  label: string | null;
};

export function ContactPhonesSection({
  contactId,
  additionalPhones,
  onUpdated,
  saving,
}: {
  contactId: string;
  additionalPhones: ContactPhone[];
  onUpdated: () => void;
  saving: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [addPhone, setAddPhone] = useState("");
  const [addLabel, setAddLabel] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = addPhone.trim();
    if (!phone) {
      setAddError("Введіть номер");
      return;
    }
    setAddSaving(true);
    setAddError(null);
    try {
      await apiHttp.post(`/contacts/${contactId}/phones`, { phone, label: addLabel.trim() || undefined });
      setAddOpen(false);
      setAddPhone("");
      setAddLabel("");
      onUpdated();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err instanceof Error ? err.message : "Помилка");
      setAddError(msg);
    } finally {
      setAddSaving(false);
    }
  };

  const handleDelete = async (phoneId: string) => {
    setMutatingId(phoneId);
    try {
      await apiHttp.delete(`/contacts/${contactId}/phones/${phoneId}`);
      onUpdated();
    } finally {
      setMutatingId(null);
    }
  };

  const handleSetPrimary = async (phoneId: string) => {
    setMutatingId(phoneId);
    try {
      await apiHttp.post(`/contacts/${contactId}/phones/${phoneId}/set-primary`);
      onUpdated();
    } finally {
      setMutatingId(null);
    }
  };

  return (
    <div className="space-y-1 py-1">
      <label className="text-sm text-zinc-500">Доп. номера</label>
      <ul className="space-y-1 text-sm">
        {additionalPhones.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2 rounded border border-zinc-100 bg-zinc-50/50 px-2 py-1.5">
            <span>
              {formatPhoneDisplay(p.phone)}
              {p.label ? <span className="ml-1 text-zinc-500">({p.label})</span> : null}
            </span>
            <span className="flex gap-1">
              <button
                type="button"
                className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                onClick={() => handleSetPrimary(p.id)}
                disabled={saving || mutatingId !== null}
              >
                Сделать основным
              </button>
              <button
                type="button"
                className="text-xs text-red-600 hover:underline disabled:opacity-50"
                onClick={() => handleDelete(p.id)}
                disabled={saving || mutatingId !== null}
              >
                Видалити
              </button>
            </span>
          </li>
        ))}
      </ul>
      {!addOpen ? (
        <button
          type="button"
          className="mt-1 text-sm text-blue-600 hover:underline disabled:opacity-50"
          onClick={() => setAddOpen(true)}
          disabled={saving}
        >
          + Додати номер
        </button>
      ) : (
        <form onSubmit={handleAdd} className="mt-2 space-y-2 rounded border border-zinc-200 bg-white p-2">
          {addError && <p className="text-xs text-red-600">{addError}</p>}
          <input
            type="text"
            value={addPhone}
            onChange={(e) => setAddPhone(e.target.value)}
            placeholder="Номер телефону"
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
          />
          <input
            type="text"
            value={addLabel}
            onChange={(e) => setAddLabel(e.target.value)}
            placeholder="Мітка (моб., робочий…)"
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
          />
          <div className="flex gap-2">
            <button type="button" className="text-sm text-zinc-600 hover:underline" onClick={() => setAddOpen(false)}>
              Скасувати
            </button>
            <button type="submit" className="text-sm text-blue-600 hover:underline" disabled={addSaving}>
              {addSaving ? "Збереження…" : "Додати"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
