"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { getUserFriendlyApiError } from "@/lib/api/errors";

type Perm = { id: string; key: string; name: string; category?: string | null };
type Role = {
  id: string;
  key: string;
  name: string;
  system?: boolean;
  permissions?: Array<{ permission: Perm }>;
};

type UserRow = { id: string; fullName?: string | null; email?: string | null; role?: string };

export default function RbacMetadataPage() {
  const [role, setRole] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<{ roles: Role[]; permissions: Perm[] } | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [effective, setEffective] = useState<unknown>(null);
  const [newRoleKey, setNewRoleKey] = useState("");
  const [newRoleName, setNewRoleName] = useState("");
  const [newRolePermKeys, setNewRolePermKeys] = useState<string>("metadata.read,metadata.write");
  const [assignRoleId, setAssignRoleId] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const loadCatalog = useCallback(() => {
    return apiHttp
      .get<{ roles: Role[]; permissions: Perm[] }>("/rbac")
      .then((r) => setCatalog(r.data ?? null))
      .catch((e) => setErr(getUserFriendlyApiError(e, "Не вдалося завантажити каталог ролей.")));
  }, []);

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((r) => setRole(r.data?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  useEffect(() => {
    if (role !== "ADMIN") return;
    void loadCatalog();
    apiHttp
      .get<{ items?: UserRow[] }>("/users")
      .then((r) => setUsers(Array.isArray(r.data?.items) ? r.data!.items! : []))
      .catch(() => {});
  }, [role, loadCatalog]);

  const customRoles = useMemo(() => (catalog?.roles ?? []).filter((r) => !r.system), [catalog]);

  const loadEffective = async (userId: string) => {
    if (!userId) return;
    setErr(null);
    try {
      const r = await apiHttp.get(`/rbac/users/${userId}/effective`);
      setEffective(r.data);
    } catch {
      setErr("Не вдалося завантажити підсумкові дозволи.");
    }
  };

  const createRole = async () => {
    setErr(null);
    setMsg(null);
    try {
      const keys = newRolePermKeys
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      await apiHttp.post("/rbac/roles", {
        key: newRoleKey.trim(),
        name: newRoleName.trim(),
        permissionKeys: keys,
      });
      setMsg("Роль створено.");
      await loadCatalog();
    } catch (e: unknown) {
      setErr(getUserFriendlyApiError(e));
    }
  };

  const assign = async () => {
    if (!selectedUserId || !assignRoleId) return;
    setErr(null);
    setMsg(null);
    try {
      await apiHttp.post(`/rbac/users/${selectedUserId}/roles`, { roleId: assignRoleId });
      setMsg("Роль призначено.");
      await loadEffective(selectedUserId);
    } catch (e: unknown) {
      setErr(getUserFriendlyApiError(e));
    }
  };

  if (role !== "ADMIN") {
    return (
      <div className="p-6">
        <p className="text-sm text-zinc-600">Доступ тільки для ADMIN.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href="/settings/metadata" className="text-sm text-zinc-600 hover:text-zinc-900">
          ← Хаб метаданих
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">Каталог ролей та дозволів</h1>
        {err ? <p className="text-sm text-red-600">{err}</p> : null}
        {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-white p-3">
            <h2 className="text-sm font-semibold text-zinc-900">Ролі ({catalog?.roles.length ?? 0})</h2>
            <ul className="mt-2 max-h-80 space-y-1 overflow-y-auto text-xs text-zinc-700">
              {(catalog?.roles ?? []).map((ro) => (
                <li key={ro.id}>
                  <span className="font-mono">{ro.key}</span> — {ro.name}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-3">
            <h2 className="text-sm font-semibold text-zinc-900">Дозволи ({catalog?.permissions.length ?? 0})</h2>
            <ul className="mt-2 max-h-80 space-y-1 overflow-y-auto text-xs text-zinc-700">
              {(catalog?.permissions ?? []).map((p) => (
                <li key={p.id}>
                  <span className="font-mono">{p.key}</span> — {p.name}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-900">Створити додаткову роль</h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-zinc-600">
              Ключ
              <input
                className="mt-1 w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                value={newRoleKey}
                onChange={(e) => setNewRoleKey(e.target.value)}
                placeholder="sales.ops"
              />
            </label>
            <label className="text-xs text-zinc-600">
              Назва
              <input
                className="mt-1 w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="Sales ops"
              />
            </label>
          </div>
          <label className="mt-2 block text-xs text-zinc-600">
            Permission keys (через кому)
            <input
              className="mt-1 w-full rounded border border-zinc-200 px-2 py-1 font-mono text-xs"
              value={newRolePermKeys}
              onChange={(e) => setNewRolePermKeys(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="mt-3 rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
            onClick={() => void createRole()}
          >
            Створити роль
          </button>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-900">Підсумкові дозволи</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <select
              className="rounded border border-zinc-200 px-2 py-1 text-sm"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="">Оберіть користувача</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName ?? u.email ?? u.id}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded border border-zinc-200 px-3 py-1 text-xs"
              onClick={() => void loadEffective(selectedUserId)}
            >
              Завантажити
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <select
              className="rounded border border-zinc-200 px-2 py-1 text-sm"
              value={assignRoleId}
              onChange={(e) => setAssignRoleId(e.target.value)}
            >
              <option value="">Роль для призначення</option>
              {customRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.key}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded bg-zinc-800 px-3 py-1 text-xs font-medium text-white"
              onClick={() => void assign()}
            >
              Призначити
            </button>
          </div>
          {effective ? (
            <pre className="mt-3 max-h-64 overflow-auto rounded border border-zinc-100 bg-zinc-50 p-2 text-xs">
              {JSON.stringify(effective, null, 2)}
            </pre>
          ) : null}
        </div>
      </div>
    </div>
  );
}
