"use client";

import { useEffect, useState } from "react";
import { Employee, EmployeeModal } from "./EmployeeModal";

type UsersResponse = {
  items?: Employee[];
  // на всякий случай, если API возвращает просто массив
};

export default function EmployeesPage() {
  const [items, setItems] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editing, setEditing] = useState<Employee | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/users", { cache: "no-store" });
      const text = await r.text();
      if (!r.ok) throw new Error(text || `Failed (${r.status})`);

      const data = JSON.parse(text) as UsersResponse | Employee[];
      const list = Array.isArray(data) ? data : (data.items ?? []);
      setItems(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load employees");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openCreate = () => {
    setModalMode("create");
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (u: Employee) => {
    setModalMode("edit");
    setEditing(u);
    setModalOpen(true);
  };

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Employees</h1>

        <button
          type="button"
          onClick={openCreate}
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800"
        >
          + Add employee
        </button>
      </div>

      <div className="mt-4 rounded-lg border border-zinc-200 bg-white">
        {loading ? (
          <div className="p-4 text-sm text-zinc-500">Loading…</div>
        ) : err ? (
          <div className="p-4 text-sm text-red-600">{err}</div>
        ) : items.length === 0 ? (
          <div className="p-4 text-sm text-zinc-500">No employees</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs text-zinc-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id} className="border-b border-zinc-100 last:border-b-0">
                  <td className="px-4 py-3 text-zinc-900">{u.fullName ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-700">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-700">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(u)}
                      className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <EmployeeModal
        open={modalOpen}
        mode={modalMode}
        initial={editing}
        onClose={() => setModalOpen(false)}
        onSaved={load}
      />
    </div>
  );
}
