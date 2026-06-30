"use client";

import { useState } from "react";
import { strings } from "@/locales";
import type { Visit } from "@/lib/api/resources/visits";

const OUTCOME_VALUES = [
  "SUCCESS",
  "FOLLOW_UP",
  "NO_DECISION",
  "NOT_RELEVANT",
  "FAILED",
] as const;

type OutcomeValue = (typeof OUTCOME_VALUES)[number];

type Props = {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    phone: string;
    firstName: string;
    lastName: string;
    outcome: string;
    resultNote: string;
  }) => Promise<Visit>;
  onSuccess?: (visit: Visit) => void;
};

export function LogAdHocVisitModal({ open, busy = false, onClose, onSubmit, onSuccess }: Props) {
  const t = strings.visitsPage.logAdHoc;
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [outcome, setOutcome] = useState<OutcomeValue | "">("");
  const [resultNote, setResultNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const reset = () => {
    setPhone("");
    setFirstName("");
    setLastName("");
    setOutcome("");
    setResultNote("");
    setError(null);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!phone.trim() || !firstName.trim() || !lastName.trim() || !outcome || !resultNote.trim()) {
      setError(t.validation);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const visit = await onSubmit({
        phone: phone.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        outcome,
        resultNote: resultNote.trim(),
      });
      reset();
      onSuccess?.(visit);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  const isBusy = busy || submitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-xl">
        <h3 className="text-lg font-semibold text-zinc-900">{t.title}</h3>
        <p className="mt-1 text-sm text-zinc-500">{t.subtitle}</p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-700">{t.phone}</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-0.5 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              autoComplete="tel"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-zinc-700">{t.firstName}</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-0.5 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                autoComplete="given-name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700">{t.lastName}</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-0.5 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                autoComplete="family-name"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700">{t.outcome}</label>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as OutcomeValue | "")}
              className="mt-0.5 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
            >
              <option value="">{t.outcomePlaceholder}</option>
              {OUTCOME_VALUES.map((value) => (
                <option key={value} value={value}>
                  {t.outcomes[value]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700">{t.comment}</label>
            <textarea
              value={resultNote}
              onChange={(e) => setResultNote(e.target.value)}
              rows={3}
              className="mt-0.5 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              placeholder={t.commentPlaceholder}
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={isBusy}
            onClick={handleClose}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void handleSubmit()}
            className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {isBusy ? "…" : t.submit}
          </button>
        </div>
      </div>
    </div>
  );
}
