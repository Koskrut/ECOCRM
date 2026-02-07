"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type User = {
  id: string;
  email: string;
  fullName: string;
  role: "ADMIN" | "LEAD" | "MANAGER";
  createdAt: string;
};

export default function AccessSettingsPage() {
  const [items, setItems] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users");
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.message || `Failed to load users (${res.status})`);
      }
      const d = await res.json();
      setItems(d.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function setRole(userId: string, role: User["role"]) {
    setSavingId(userId);
    setError(null);
    try {
      const res = await fetch(`/api/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.message || `Failed to update role (${res.status})`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
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
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">Access & Permissions</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Manage employee roles (ADMIN / LEAD / MANAGER)
          </p>
        </div>

      {error && (
          <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700 border border-red-100">
            {error}
          </div>
        )}

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
                        onChange={(e) => void setRole(u.id, e.target.value as User["role"])}
                        className="rounded-md border px-2 py-1 text-sm bg-white"
                      >
                        <option value="ADMIN">ADMIN</option>
                        <option value="LEAD">LEAD</option>
                        <option value="MANAGER">MANAGER</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-zinc-600">
                      {new Date(u.createdAt).toLocaleDateString()}
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
