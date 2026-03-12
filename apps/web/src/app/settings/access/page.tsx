"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiHttp } from "../../../lib/api/client";

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

function getApiErrorMessage(e: unknown, fallback: string) {
  const msg =
    (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data
      ?.message ??
    (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.error;

  if (msg) return msg;
  return e instanceof Error ? e.message : fallback;
}

export default function AccessSettingsPage() {
  const [items, setItems] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiHttp.get<UsersResponse>("/users");
      setItems(res.data?.items ?? []);
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to load users"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function setRole(userId: string, role: UserRole) {
    setSavingId(userId);
    setError(null);
    try {
      await apiHttp.patch(`/users/${userId}/role`, { role });
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to update role"));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-6xl">
        {/* Breadcrumb / header */}
        <div className="mb-6">
          <Link
            href="/settings"
            className="inline-flex items-center text-sm text-zinc-600 hover:text-zinc-900"
          >
            ← Back to Settings
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">Access &amp; Permissions</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Manage employee roles (USER / LEAD / MANAGER / ADMIN)
          </p>
        </div>

        {error ? (
          <div className="mb-4 rounded-md border border-red-100 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs font-medium uppercase text-zinc-500">
              <tr>
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Email</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Created</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-zinc-500">
                    Loading...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-zinc-500">
                    No users
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
                      {u.createdAt ? new Date(u.createdAt).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
