"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

const EMPTY_PLACEHOLDER = "Click to add…";

export type InlineEditableFieldProps = {
  label: string;
  value: string | null;
  placeholder?: string;
  kind: "text" | "textarea" | "select";
  options?: Array<{ value: string; label: string }>;
  disabled?: boolean;
  required?: boolean;
  onSave: (next: string | null) => Promise<void>;
  /** When this field enters or exits edit mode, call with cancel callback or null. Used for ESC priority. */
  onRegisterCancel?: (cancel: (() => void) | null) => void;
};

export function InlineEditableField({
  label,
  value,
  placeholder = EMPTY_PLACEHOLDER,
  kind,
  options = [],
  disabled,
  required,
  onSave,
  onRegisterCancel,
}: InlineEditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);

  const displayValue = value?.trim() ?? "";
  const isEmpty = !displayValue;

  const cancelEdit = useCallback(() => {
    setLocal(displayValue);
    setError(null);
    setEditing(false);
    onRegisterCancel?.(null);
  }, [displayValue, onRegisterCancel]);

  useEffect(() => {
    if (editing) {
      setLocal(displayValue);
      setError(null);
      onRegisterCancel?.(cancelEdit);
      inputRef.current?.focus();
      return () => onRegisterCancel?.(null);
    }
  }, [editing, displayValue, onRegisterCancel, cancelEdit]);

  const save = useCallback(async () => {
    const next = local.trim() || null;
    if (next === (value?.trim() ?? null) && !required) {
      setEditing(false);
      onRegisterCancel?.(null);
      return;
    }
    if (required && !next) {
      setError("This field is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
      setEditing(false);
      onRegisterCancel?.(null);
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Save failed");
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [local, value, required, onSave, onRegisterCancel]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelEdit();
        return;
      }
      if (e.key === "Enter" && kind !== "textarea") {
        e.preventDefault();
        void save();
        return;
      }
      if ((e.key === "Enter" && (e.metaKey || e.ctrlKey)) && kind === "textarea") {
        e.preventDefault();
        void save();
      }
    },
    [kind, cancelEdit, save],
  );

  const handleBlur = useCallback(() => {
    if (kind === "textarea") return;
    const next = local.trim() || null;
    const same = next === (value?.trim() ?? null);
    if (same && !required) {
      setEditing(false);
      onRegisterCancel?.(null);
      return;
    }
    void save();
  }, [kind, local, value, required, save, onRegisterCancel]);

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-4 py-1">
        <span className="text-sm text-zinc-500">{label}</span>
        <button
          type="button"
          onClick={() => !disabled && setEditing(true)}
          disabled={disabled}
          className="min-w-0 flex-1 text-right text-sm text-zinc-900 hover:underline disabled:opacity-50"
        >
          {isEmpty ? placeholder : displayValue}
        </button>
      </div>
    );
  }

  const inputClassName =
    "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none disabled:opacity-50";

  return (
    <div className="py-1">
      <label className="block text-xs font-medium text-zinc-600">{label}</label>
      <div className="mt-1">
        {kind === "text" && (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            disabled={saving}
            className={inputClassName}
            placeholder={placeholder === EMPTY_PLACEHOLDER ? "" : placeholder}
          />
        )}
        {kind === "textarea" && (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => void save()}
            disabled={saving}
            rows={3}
            className={inputClassName}
            placeholder={placeholder === EMPTY_PLACEHOLDER ? "" : placeholder}
          />
        )}
        {kind === "select" && (
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            disabled={saving}
            className={inputClassName}
          >
            <option value="">—</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>
      {saving && <p className="mt-1 text-xs text-zinc-500">Saving…</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <p className="mt-1 text-xs text-zinc-400">
        {kind === "textarea" ? "Ctrl+Enter to save" : "Enter to save, Esc to cancel"}
      </p>
    </div>
  );
}
