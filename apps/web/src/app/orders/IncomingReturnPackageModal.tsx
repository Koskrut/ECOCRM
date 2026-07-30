"use client";

import { useState } from "react";
import { returnPackagesApi } from "@/lib/api/resources/return-packages";
import { strings } from "@/locales";

type ContactOption = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
};

export function IncomingReturnPackageModal({
  open,
  onClose,
  onCreated,
  defaultOrderId,
  defaultContactId,
  contactSearch,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  defaultOrderId?: string;
  defaultContactId?: string;
  contactSearch?: (q: string) => Promise<ContactOption[]>;
}) {
  const [ttnNumber, setTtnNumber] = useState("");
  const [note, setNote] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [contactId, setContactId] = useState(defaultContactId ?? "");
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  const t = strings.orders.modal;

  const searchContacts = async () => {
    if (!contactSearch || contactQuery.trim().length < 2) return;
    setSearching(true);
    try {
      const list = await contactSearch(contactQuery.trim());
      setContactOptions(list);
    } catch {
      setContactOptions([]);
    } finally {
      setSearching(false);
    }
  };

  const submit = async () => {
    const ttn = ttnNumber.replace(/\s+/g, "").trim();
    if (ttn.length < 4) {
      setErr("Вкажіть номер ТТН");
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      await returnPackagesApi.create({
        ttnNumber: ttn,
        contactId: contactId || undefined,
        orderId: defaultOrderId,
        note: note.trim() || undefined,
        itemsPending: !!defaultOrderId,
      });
      setTtnNumber("");
      setNote("");
      setContactQuery("");
      setContactId(defaultContactId ?? "");
      setContactOptions([]);
      onCreated?.();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не вдалося створити посилку");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={() => {
        if (submitting) return;
        onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-zinc-900">{t.incomingReturnPackageTitle}</h3>
        <p className="mt-1 text-sm text-zinc-600">{t.incomingReturnPackageHint}</p>

        <label className="mt-4 block text-sm font-medium text-zinc-700">
          {t.returnTtnLabel}
          <input
            type="text"
            value={ttnNumber}
            onChange={(e) => setTtnNumber(e.target.value)}
            placeholder="20450000000000"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>

        {contactSearch ? (
          <div className="mt-3">
            <label className="block text-sm font-medium text-zinc-700">{t.returnContactHint}</label>
            <div className="mt-1 flex gap-2">
              <input
                type="search"
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={searching}
                onClick={() => void searchContacts()}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50"
              >
                Пошук
              </button>
            </div>
            {contactOptions.length > 0 ? (
              <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                {contactOptions.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setContactId(c.id)}
                    className={`block w-full rounded border px-2 py-1.5 text-left text-sm ${
                      contactId === c.id ? "border-zinc-900 bg-zinc-50" : "border-zinc-200"
                    }`}
                  >
                    {c.lastName} {c.firstName} · {c.phone}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <label className="mt-3 block text-sm font-medium text-zinc-700">
          Примітка
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>

        {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
          >
            {strings.common.cancel}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submit()}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {submitting ? "…" : t.createIncomingPackage}
          </button>
        </div>
      </div>
    </div>
  );
}
