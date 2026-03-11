"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { deleteBankAccount } from "@/lib/api/resources";

type BankAccount = {
  id: string;
  name: string;
  currency: string;
  iban?: string | null;
  isActive: boolean;
  credentialsMasked?: {
    clientIdMasked?: string;
    tokenMasked?: string;
    idMasked?: string;
  };
};

function getApiErrorMessage(e: unknown, fallback: string) {
  const msg =
    (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data
      ?.message ??
    (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.error;
  return msg ?? (e instanceof Error ? e.message : fallback);
}

export default function FopSettingsPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addCurrency, setAddCurrency] = useState<"UAH" | "USD" | "EUR">("UAH");
  const [addIban, setAddIban] = useState("");
  const [addClientId, setAddClientId] = useState("");
  const [addGroupId, setAddGroupId] = useState("");
  const [addToken, setAddToken] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editIban, setEditIban] = useState("");
  const [editClientIdVal, setEditClientIdVal] = useState("");
  const [editGroupIdVal, setEditGroupIdVal] = useState("");
  const [editToken, setEditToken] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiHttp.get<BankAccount[]>("/bank/accounts");
      setAccounts(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to load FOPs"));
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitAdd() {
    if (!addName.trim()) {
      setError("Enter name");
      return;
    }
    setAddSubmitting(true);
    setError(null);
    try {
      await apiHttp.post("/bank/accounts", {
        provider: "PRIVAT24",
        name: addName.trim(),
        currency: addCurrency,
        iban: addIban.trim() || undefined,
        credentials: {
          clientId: addClientId.trim() || undefined,
          token: addToken.trim() || undefined,
          id: addGroupId.trim() || undefined,
        },
      });
      setShowAdd(false);
      setAddName("");
      setAddCurrency("UAH");
      setAddIban("");
      setAddClientId("");
      setAddGroupId("");
      setAddToken("");
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to add FOP"));
    } finally {
      setAddSubmitting(false);
    }
  }

  function openEdit(acc: BankAccount) {
    setEditId(acc.id);
    setEditName(acc.name);
    setEditIban(acc.iban ?? "");
    setEditClientIdVal("");
    setEditGroupIdVal("");
    setEditToken("");
    setError(null);
  }

  async function submitEdit() {
    if (!editId || !editName.trim()) return;
    setEditSubmitting(true);
    setError(null);
    try {
      const body: { name: string; iban?: string; credentials?: { clientId?: string; token?: string; id?: string } } = {
        name: editName.trim(),
        iban: editIban.trim() || undefined,
      };
      if (editClientIdVal !== "" || editGroupIdVal !== "" || editToken !== "") {
        body.credentials = {};
        if (editClientIdVal !== "") body.credentials.clientId = editClientIdVal.trim() || undefined;
        if (editGroupIdVal !== "") body.credentials.id = editGroupIdVal.trim() || undefined;
        if (editToken !== "") body.credentials.token = editToken.trim() || undefined;
      }
      await apiHttp.patch(`/bank/accounts/${editId}`, body);
      setEditId(null);
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to update FOP"));
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDelete(acc: BankAccount) {
    if (
      !window.confirm(
        `Вы уверены, что хотите удалить ФОП "${acc.name}" (${acc.currency})? Это также удалит связанные банковские транзакции.`,
      )
    ) {
      return;
    }
    setDeleteId(acc.id);
    setError(null);
    try {
      await deleteBankAccount(acc.id);
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to delete FOP"));
    } finally {
      setDeleteId(null);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <Link
            href="/settings"
            className="inline-flex items-center text-sm text-zinc-600 hover:text-zinc-900"
          >
            ← Back to Settings
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">ФОП (банковские счета)</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Настройка ID и TOKEN для банковских счетов ФОП. Список используется в разделе Платежи для переключения между ФОПами.
          </p>
        </div>

        {error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : (
          <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <span className="text-sm font-medium text-zinc-700">Список ФОПов</span>
              <button
                type="button"
                onClick={() => {
                  setShowAdd(true);
                  setAddName("");
                  setAddCurrency("UAH");
                  setAddClientId("");
                  setAddGroupId("");
                  setAddToken("");
                  setError(null);
                }}
                className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
              >
                + Добавить ФОП
              </button>
            </div>
            <ul className="divide-y divide-zinc-100">
              {accounts.map((acc) => (
                <li
                  key={acc.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-zinc-50"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-zinc-900">{acc.name}</span>
                    <span className="ml-2 text-sm text-zinc-500">({acc.currency})</span>
                    {acc.iban && (
                      <div className="mt-0.5 text-xs text-zinc-600 font-mono">IBAN: {acc.iban}</div>
                    )}
                    <div className="mt-0.5 text-xs text-zinc-500">
                      ID: {acc.credentialsMasked?.clientIdMasked ?? acc.credentialsMasked?.idMasked ?? "—"} · TOKEN:{" "}
                      {acc.credentialsMasked?.tokenMasked ?? "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(acc)}
                      className="rounded border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                    >
                      Изменить
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(acc)}
                      disabled={deleteId === acc.id}
                      className="rounded border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deleteId === acc.id ? "Удаление…" : "Удалить"}
                    </button>
                  </div>
                </li>
              ))}
              {accounts.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-zinc-500">
                  Нет добавленных ФОПов. Нажмите «Добавить ФОП».
                </li>
              )}
            </ul>
          </div>
        )}

        {showAdd && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-lg">
              <h3 className="text-lg font-semibold text-zinc-900">Добавить ФОП</h3>
              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-600">Название</label>
                  <input
                    type="text"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    placeholder="Например: ФОП Иванов"
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600">Валюта</label>
                  <select
                    value={addCurrency}
                    onChange={(e) => setAddCurrency(e.target.value as "UAH" | "USD" | "EUR")}
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                  >
                    <option value="UAH">UAH</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600">IBAN</label>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Выписка тянуется только по счёту с указанным IBAN. Обязательно для синхронизации.
                  </p>
                  <input
                    type="text"
                    value={addIban}
                    onChange={(e) => setAddIban(e.target.value)}
                    placeholder="UA123456789012345678901234567"
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600">App ID</label>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    ID додатку з кнопки «ID i Token» (може бути UUID).
                  </p>
                  <input
                    type="text"
                    value={addClientId}
                    onChange={(e) => setAddClientId(e.target.value)}
                    placeholder="Наприклад: 67db69c5-a961-4e0d-85f4-8cc551dc885f"
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600">Group client ID</label>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Лише для режиму групи ПП. Це id клієнта в групі (наприклад 44****05), не App ID.
                  </p>
                  <input
                    type="text"
                    value={addGroupId}
                    onChange={(e) => setAddGroupId(e.target.value)}
                    placeholder="Наприклад: 44****05"
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600">TOKEN</label>
                  <input
                    type="password"
                    value={addToken}
                    onChange={(e) => setAddToken(e.target.value)}
                    placeholder="Токен для API банка"
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                  />
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAdd(false);
                    setError(null);
                  }}
                  disabled={addSubmitting}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => void submitAdd()}
                  disabled={!addName.trim() || addSubmitting}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {addSubmitting ? "Сохранение…" : "Добавить"}
                </button>
              </div>
            </div>
          </div>
        )}

        {editId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-lg">
              <h3 className="text-lg font-semibold text-zinc-900">Редактировать ФОП</h3>
              <p className="mt-0.5 text-xs text-zinc-500">
                Залиште App ID, Group client ID і TOKEN порожніми, щоб не змінювати поточні значення.
              </p>
              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-600">Название</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600">IBAN</label>
                  <input
                    type="text"
                    value={editIban}
                    onChange={(e) => setEditIban(e.target.value)}
                    placeholder="Выписка только по этому счёту"
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600">App ID</label>
                  <input
                    type="text"
                    value={editClientIdVal}
                    onChange={(e) => setEditClientIdVal(e.target.value)}
                    placeholder="Залиште порожнім, щоб не змінювати"
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600">Group client ID</label>
                  <input
                    type="text"
                    value={editGroupIdVal}
                    onChange={(e) => setEditGroupIdVal(e.target.value)}
                    placeholder="Наприклад: 44****05 (лише для групи ПП)"
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600">TOKEN</label>
                  <input
                    type="password"
                    value={editToken}
                    onChange={(e) => setEditToken(e.target.value)}
                    placeholder="Залиште порожнім, щоб не змінювати"
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                  />
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditId(null)}
                  disabled={editSubmitting}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => void submitEdit()}
                  disabled={!editName.trim() || editSubmitting}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {editSubmitting ? "Сохранение…" : "Сохранить"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
