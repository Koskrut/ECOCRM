"use client";

import { useEffect, useMemo, useState } from "react";

export type Employee = {
  id: string;
  email: string;
  fullName?: string | null;
  role: "ADMIN" | "LEAD" | "USER";
};

function pickMessage(text: string) {
  try {
    const j = JSON.parse(text);
    return j?.message || j?.error || text;
  } catch {
    return text;
  }
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
        const r = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim(),
            fullName: fullName.trim() || null,
            password: password.trim(),
            role,
          }),
        });

        const t = await r.text();
        if (!r.ok) throw new Error(pickMessage(t) || `Failed (${r.status})`);
      } else {
        if (!initial?.id) throw new Error("Missing user id");

        // 1) имя/пароль (пароль отправляем только если введен)
        const payload: any = { fullName: fullName.trim() || null };
        if (password.trim().length > 0) payload.password = password.trim();

        const r1 = await fetch(`/api/users/${initial.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
        });
        const t1 = await r1.text();
        if (!r1.ok) throw new Error(pickMessage(t1) || `Failed (${r1.status})`);

        // 2) роль — отдельный endpoint
        const r2 = await fetch(`/api/users/${initial.id}/role`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        });
        const t2 = await r2.text();
        if (!r2.ok) throw new Error(pickMessage(t2) || `Failed (${r2.status})`);
      }

      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
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
      const r = await fetch(`/api/users/${initial.id}`, { method: "DELETE" });
      const t = await r.text();
      if (!r.ok) throw new Error(pickMessage(t) || `Fus})`);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="presentation"
      onClick={() => !saving && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div className="text-base font-semibold text-zinc-900">{title}</div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4">
          {error && (
            <div className="mb-3 rounded-md rder border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <label className="block text-sm font-medium text-zinc-700">Email</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={saving || mode === "edit"} // email не меняем в edit
            placeholder="user@company.com"
            autoComplete="email"
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

          <label className="mt-3 block tex-medium text-zinc-700">
            {mode === "create" ? "Password" : "New password (optional)"}
          </label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={saving}
            placeholder={mode === "create" ? "••••••" : "leave empty to keep current"}
            type="password"
            autoComplete={mode === "create" ? "new-password" : "new-password"}
          />

          <label className="mt-3 block text-sm font-medium text-zinc-700">Role</label>
          <select
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={role}
            onChange={(e) => setRole(e.target.value as any)}
            disabled={saving}
          >
            <option value="MANAGER">USER</option>
            <option value="LEAD">LEAD</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-zinc-200 px-5 py-4">
          <div>
            {canDelete && (
              <button
                type="button"
                onClick={remove}
                disabled={saving}
                className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Delete
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
