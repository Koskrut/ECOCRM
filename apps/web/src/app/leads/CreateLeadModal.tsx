"use client";

import { useCallback, useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import type { LeadSource, Lead } from "@/lib/api";

type CompanyOption = { id: string; name: string };

type Props = {
  onClose: () => void;
  onCreated: (lead: Lead) => void;
};

export function CreateLeadModal({ onClose, onCreated }: Props) {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);

  const [companyId, setCompanyId] = useState<string>("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [message, setMessage] = useState("");
  const [source, setSource] = useState<LeadSource>("OTHER");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canClose = !saving;

  const loadCompanies = useCallback(async () => {
    setLoadingCompanies(true);
    try {
      const res = await apiHttp.get<{ items?: CompanyOption[] }>("/companies?page=1&pageSize=200");
      setCompanies(Array.isArray(res.data?.items) ? res.data.items : []);
    } finally {
      setLoadingCompanies(false);
    }
  }, []);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (canClose) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canClose, onClose]);

  const submit = async () => {
    setErr(null);
    if (!companyId) {
      setErr("Выберите компанию");
      return;
    }
    if (!phone.trim() && !email.trim()) {
      setErr("Нужно указать телефон или email");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        companyId,
        source,
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        companyName: companyName.trim() || undefined,
        message: message.trim() || undefined,
      };

      const res = await apiHttp.post<Lead>("/leads", payload);
      onCreated(res.data);
      onClose();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Не удалось создать лид");
      setErr(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="presentation"
      onClick={() => canClose && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div className="text-base font-semibold text-zinc-900">Новый лид</div>
          <button
            type="button"
            onClick={() => canClose && onClose()}
            className="rounded-md border border-zinc-200 px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto px-5 py-4 text-sm">
          {err && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {err}
            </div>
          )}

          <label className="block text-xs font-medium text-zinc-600">Компания</label>
          <select
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            disabled={loadingCompanies || saving}
          >
            <option value="">— выберите компанию —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-600">Имя</label>
              <input
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">Телефон</label>
              <input
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={saving}
                placeholder="+380…"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">Email</label>
              <input
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={saving}
                placeholder="email@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">
                Компания (текст)
              </label>
              <input
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={saving}
                placeholder="Название из источника"
              />
            </div>
          </div>

          <label className="mt-3 block text-xs font-medium text-zinc-600">Источник</label>
          <select
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={source}
            onChange={(e) => setSource(e.target.value as LeadSource)}
            disabled={saving}
          >
            <option value="FACEBOOK">Facebook</option>
            <option value="TELEGRAM">Telegram</option>
            <option value="INSTAGRAM">Instagram</option>
            <option value="WEBSITE">Сайт</option>
            <option value="OTHER">Другое</option>
          </select>

          <label className="mt-3 block text-xs font-medium text-zinc-600">
            Сообщение / комментарий
          </label>
          <textarea
            rows={3}
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={saving}
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-5 py-3">
          <button
            type="button"
            onClick={() => canClose && onClose()}
            className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-white"
            disabled={saving}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            disabled={saving}
          >
            {saving ? "Создание…" : "Создать"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateLeadModal;

