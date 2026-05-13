"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getUserFriendlyApiError } from "@/lib/api/errors";
import { apiHttp } from "../../../lib/api/client";
import { formatDateTime } from "@/lib/crmDatetime";

/** Same order as Employees modal: USER, LEAD, MANAGER, ADMIN */
const ROLE_OPTIONS = ["USER", "LEAD", "MANAGER", "ADMIN"] as const;
type UserRole = (typeof ROLE_OPTIONS)[number];

type User = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  createdAt: string;
};

type UsersResponse = { items: User[] };
type Permission = { id: string; key: string; name: string };
type RbacRole = {
  id: string;
  key: string;
  name: string;
  system?: boolean;
};
type Assignment = {
  role: RbacRole;
};
type Effective = { userId: string; legacyRole: string; permissions: string[] };

export default function AccessSettingsPage() {
  const [items, setItems] = useState<User[]>([]);
  const [catalogRoles, setCatalogRoles] = useState<RbacRole[]>([]);
  const [catalogPermissions, setCatalogPermissions] = useState<Permission[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [effective, setEffective] = useState<Effective | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingRbac, setLoadingRbac] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiHttp.get<UsersResponse>("/users");
      setItems(res.data?.items ?? []);
    } catch (e) {
      setError(getUserFriendlyApiError(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadCatalog() {
    setLoadingRbac(true);
    try {
      const res = await apiHttp.get<{ roles: RbacRole[]; permissions: Permission[] }>("/rbac");
      setCatalogRoles(res.data?.roles ?? []);
      setCatalogPermissions(res.data?.permissions ?? []);
    } catch (e) {
      setError(getUserFriendlyApiError(e, "Не вдалося завантажити каталог прав доступу."));
    } finally {
      setLoadingRbac(false);
    }
  }

  async function loadUserAccess(userId: string) {
    if (!userId) return;
    setError(null);
    try {
      const [assignmentsRes, effectiveRes] = await Promise.all([
        apiHttp.get<{ items: Assignment[] }>(`/rbac/users/${userId}/assignments`),
        apiHttp.get<Effective>(`/rbac/users/${userId}/effective`),
      ]);
      setAssignments(assignmentsRes.data?.items ?? []);
      setEffective(effectiveRes.data ?? null);
    } catch (e) {
      setError(getUserFriendlyApiError(e, "Не вдалося завантажити права обраного користувача."));
    }
  }

  useEffect(() => {
    void Promise.all([loadUsers(), loadCatalog()]);
  }, []);

  useEffect(() => {
    if (!selectedUserId) {
      setAssignments([]);
      setEffective(null);
      return;
    }
    void loadUserAccess(selectedUserId);
  }, [selectedUserId]);

  async function setRole(userId: string, role: UserRole) {
    setSavingId(userId);
    setError(null);
    setMessage(null);
    try {
      await apiHttp.patch(`/users/${userId}/role`, { role });
      setMessage("Базову роль оновлено.");
      await loadUsers();
      if (selectedUserId === userId) {
        await loadUserAccess(userId);
      }
    } catch (e) {
      setError(getUserFriendlyApiError(e));
    } finally {
      setSavingId(null);
    }
  }

  async function assignRole() {
    if (!selectedUserId || !selectedRoleId) return;
    setAssigning(true);
    setError(null);
    setMessage(null);
    try {
      await apiHttp.post(`/rbac/users/${selectedUserId}/roles`, { roleId: selectedRoleId });
      setMessage("Додаткову роль призначено.");
      await loadUserAccess(selectedUserId);
    } catch (e) {
      setError(getUserFriendlyApiError(e));
    } finally {
      setAssigning(false);
    }
  }

  async function removeRole(roleId: string) {
    if (!selectedUserId) return;
    setAssigning(true);
    setError(null);
    setMessage(null);
    try {
      await apiHttp.delete(`/rbac/users/${selectedUserId}/roles/${roleId}`);
      setMessage("Додаткову роль знято.");
      await loadUserAccess(selectedUserId);
    } catch (e) {
      setError(getUserFriendlyApiError(e));
    } finally {
      setAssigning(false);
    }
  }

  const selectedUserName =
    items.find((item) => item.id === selectedUserId)?.fullName ??
    items.find((item) => item.id === selectedUserId)?.email ??
    "—";
  const customRoles = catalogRoles.filter((role) => !role.system);

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <Link
            href="/settings"
            className="inline-flex items-center text-sm text-zinc-600 hover:text-zinc-900"
          >
            ← До налаштувань
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">Доступ і команда</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Базові ролі співробітників та додаткові RBAC-права в одному місці.
          </p>
        </div>

        {message ? (
          <div className="mb-4 rounded-md border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-700">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="mb-4 rounded-md border border-red-100 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs font-medium uppercase text-zinc-500">
              <tr>
                <th className="px-6 py-3">Ім'я</th>
                <th className="px-6 py-3">Email</th>
                <th className="px-6 py-3">Базова роль</th>
                <th className="px-6 py-3">Створено</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-zinc-500">
                    Завантаження...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-zinc-500">
                    Користувачів не знайдено
                  </td>
                </tr>
              ) : (
                items.map((u) => (
                  <tr key={u.id} className="hover:bg-zinc-50">
                    <td className="px-6 py-4 font-medium text-zinc-900">{u.fullName}</td>
                    <td className="px-6 py-4 text-zinc-600">{u.email}</td>
                    <td className="px-6 py-4">
                      <select
                        value={u.role}
                        disabled={savingId === u.id}
                        onChange={(e) => void setRole(u.id, e.target.value as UserRole)}
                        className="rounded-md border px-2 py-1 text-sm bg-white"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-4 text-zinc-600">
                      {u.createdAt ? formatDateTime(u.createdAt) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Додаткові ролі та підсумкові дозволи</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Базова роль задає стандартний набір прав. Додаткові RBAC-ролі розширюють дозволи.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <label className="text-xs text-zinc-600">
              Співробітник
              <select
                className="mt-1 w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
              >
                <option value="">Оберіть співробітника</option>
                {items.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName || u.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-600">
              Додаткова роль
              <select
                className="mt-1 w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(e.target.value)}
                disabled={!selectedUserId || loadingRbac || customRoles.length === 0}
              >
                <option value="">
                  {loadingRbac ? "Завантаження ролей..." : "Оберіть роль"}
                </option>
                {customRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.key})
                  </option>
                ))}
              </select>
            </label>
            <div className="self-end">
              <button
                type="button"
                onClick={() => void assignRole()}
                disabled={!selectedUserId || !selectedRoleId || assigning}
                className="rounded bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {assigning ? "Призначення..." : "Призначити роль"}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded border border-zinc-200 bg-zinc-50 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
                Призначені додаткові ролі
              </h3>
              <p className="mt-1 text-xs text-zinc-500">
                Користувач: <span className="font-medium text-zinc-700">{selectedUserName}</span>
              </p>
              {selectedUserId && assignments.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">Додаткові ролі не призначені.</p>
              ) : null}
              <ul className="mt-2 space-y-2">
                {assignments.map((item) => (
                  <li
                    key={item.role.id}
                    className="flex items-center justify-between rounded border border-zinc-200 bg-white px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium text-zinc-900">{item.role.name}</div>
                      <div className="text-xs text-zinc-500 font-mono">{item.role.key}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeRole(item.role.id)}
                      className="text-xs text-red-600 hover:text-red-700"
                      disabled={assigning}
                    >
                      Зняти
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded border border-zinc-200 bg-zinc-50 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Підсумкові дозволи</h3>
              {!selectedUserId || !effective ? (
                <p className="mt-3 text-sm text-zinc-500">Оберіть співробітника, щоб переглянути підсумкові права.</p>
              ) : (
                <>
                  <p className="mt-1 text-xs text-zinc-500">
                    Базова роль: <span className="font-medium text-zinc-700">{effective.legacyRole}</span>
                  </p>
                  <div className="mt-2 max-h-56 overflow-auto rounded border border-zinc-200 bg-white p-2">
                    {effective.permissions.length === 0 ? (
                      <p className="text-sm text-zinc-500">Дозволи відсутні.</p>
                    ) : (
                      <ul className="space-y-1 text-xs text-zinc-700">
                        {effective.permissions.map((permissionKey) => (
                          <li key={permissionKey} className="font-mono">
                            {permissionKey}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
              {catalogPermissions.length > 0 ? (
                <p className="mt-2 text-[11px] text-zinc-500">
                  У каталозі доступно {catalogPermissions.length} permission keys.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
