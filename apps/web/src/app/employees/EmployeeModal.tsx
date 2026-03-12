// apps/web/src/app/employees/EmployeeModal.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { apiHttp } from "../../lib/api/client";

export type Employee = {
  id: string;
  email: string;
  fullName?: string | null;
  role: "ADMIN" | "LEAD" | "USER";
};

function pickMessage(e: unknown, fallback: string) {
  const anyErr = e as { response?: { data?: { message?: string; error?: string } } };
  return (
    anyErr?.response?.data?.message ||
    anyErr?.response?.data?.error ||
    (e instanceof Error ? e.message : fallback)
  );
}

export function EmployeeModal({
  open,
  mode,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  initial: Employee | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const title = mode === "create" ? "Add employee" : "Edit employee";

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Employee["role"]>("USER");
  const [password, setPassword] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = useMemo(() => mode === "edit" && !!initial?.id, [mode, initial?.id]);

  useEffect(() => {
    if (!open) return;
    setError(null);

    if (mode === "edit" && initial) {
      setEmail(initial.email ?? "");
      setFullName(initial.fullName ?? "");
      setRole(initial.role ?? "USER");
      setPassword("");
    } else {
      setEmail("");
      setFullName("");
      setRole("USER");
      setPassword("");
    }
  }, [open, mode, initial]);

  const validate = () => {
    if (mode === "create") {
      if (email.trim().length === 0) return "Email is required";
      if (!email.includes("@")) return "Invalid email";
      if (password.trim().length < 6) return "Password must be at least 6 characters";
    }
    if (mode === "edit") {
      if (password.trim().length > 0 && password.trim().length < 6) {
        return "Password must be at least 6 characters";
      }
    }
    return null;
  };

  const save = async () => {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (mode === "create") {
        await apiHttp.post("/users", {
          email: email.trim(),
          fullName: fullName.trim() || null,
          password: password.trim(),
          role,
        });
      } else {
        if (!initial?.id) throw new Error("Missing user id");

        // 1) fullName/password (password only if provided)
        const payload = {
          email: email.trim(),
          fullName: fullName.trim() || null,
          password: password.trim(),
          role,
        };

        if (password.trim().length > 0) payload.password = password.trim();

        await apiHttp.patch(`/users/${initial.id}`, payload);

        // 2) role via dedicated endpoint
        await apiHttp.patch(`/users/${initial.id}/role`, { role });
      }

      onSaved();
      onClose();
    } catch (e) {
      setError(pickMessage(e, "Failed"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!initial?.id) return;
    if (!confirm(`Delete employee ${initial.email}?`)) return;

    setSaving(true);
    setError(null);

    try {
      await apiHttp.delete(`/users/${initial.id}`);
      onSaved();
      onClose();
    } catch (e) {
      setError(pickMessage(e, "Failed"));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm"
      role="presentation"
      onClick={() => !saving && onClose()}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div className="text-base font-semibold text-zinc-900">{title}</div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-zinc-200 px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4">
          {error && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <label className="block text-sm font-medium text-zinc-700">
            Email {mode === "edit" ? "(логін)" : ""}
          </label>
          <input
            type="text"
            className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 disabled:bg-zinc-100"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={false}
            placeholder="user@company.com"
            autoComplete="off"
          />

          <label className="mt-3 block text-sm font-medium text-zinc-700">Full name</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={saving}
            placeholder="John Doe"
            autoComplete="name"
          />

          <label className="mt-3 block text-sm font-medium text-zinc-700">
            {mode === "create" ? "Password" : "New password (optional)"}
          </label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={saving}
            placeholder={mode === "create" ? "••••••" : "leave empty to keep current"}
            type="password"
            autoComplete="new-password"
          />

          <label className="mt-3 block text-sm font-medium text-zinc-700">Role</label>
          <select
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={role}
            onChange={(e) => setRole(e.target.value as Employee["role"])}
            disabled={saving}
          >
            <option value="USER">USER</option>
            <option value="LEAD">LEAD</option>
            <option value="ADMIN">ADMIN</option>
          </select>

          <div className="mt-5 flex items-center justify-between">
            <div>
              {canDelete ? (
                <button
                  type="button"
                  onClick={() => void remove()}
                  disabled={saving}
                  className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Delete
                </button>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="btn-primary"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
