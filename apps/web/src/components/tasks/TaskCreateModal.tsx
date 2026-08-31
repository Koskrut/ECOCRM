"use client";

import { useEffect, useRef, useState } from "react";
import { scheduleModalClose } from "@/lib/modal/scheduleModalClose";
import {
  datetimeLocalKyivToIso,
} from "@/lib/crmDatetime";
import { apiHttp } from "@/lib/api/client";
import { authApi } from "@/lib/api/resources/auth";
import { tasksApi, type Task } from "@/lib/api/resources/tasks";
import { strings } from "@/locales";
import {
  TaskEntityLinker,
  entityLinkToIds,
  type TaskEntityLinkValue,
  type TaskEntityType,
} from "./TaskEntityLinker";

const t = strings.tasks;

type UserOption = { id: string; fullName: string };

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (task: Task) => void;
  /** Prefill entity link when creating from a card. */
  preset?: {
    contactId?: string | null;
    companyId?: string | null;
    leadId?: string | null;
    orderId?: string | null;
    lockedType?: TaskEntityType;
    linkLabel?: string;
  };
};

export function TaskCreateModal({ open, onClose, onCreated, preset }: Props) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [body, setBody] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [collaboratorIds, setCollaboratorIds] = useState<string[]>([]);
  const [link, setLink] = useState<TaskEntityLinkValue>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDueAt("");
    setBody("");
    setCollaboratorIds([]);
    setError(null);
    if (preset?.contactId) {
      setLink({
        type: "contact",
        id: preset.contactId,
        label: preset.linkLabel || t.linkedTo.contact,
      });
    } else if (preset?.companyId) {
      setLink({
        type: "company",
        id: preset.companyId,
        label: preset.linkLabel || t.linkedTo.company,
      });
    } else if (preset?.leadId) {
      setLink({
        type: "lead",
        id: preset.leadId,
        label: preset.linkLabel || t.linkedTo.lead,
      });
    } else if (preset?.orderId) {
      setLink({
        type: "order",
        id: preset.orderId,
        label: preset.linkLabel || t.linkedTo.order,
      });
    } else {
      setLink(null);
    }
    void (async () => {
      try {
        const [usersRes, meRes] = await Promise.all([
          apiHttp.get<{ items: UserOption[] }>("/users", { params: { scope: "assignees" } } as never),
          authApi.me(),
        ]);
        setUsers(usersRes.data?.items ?? []);
        setAssigneeId(meRes.user?.id ?? "");
      } catch {
        setUsers([]);
      }
    })();
    const tFocus = window.setTimeout(() => titleRef.current?.focus(), 50);
    return () => window.clearTimeout(tFocus);
  }, [open, preset?.contactId, preset?.companyId, preset?.leadId, preset?.orderId, preset?.linkLabel]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) scheduleModalClose(onClose);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving, onClose]);

  if (!open) return null;

  const submit = async () => {
    if (!title.trim()) {
      setError(t.errors.titleRequired);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await tasksApi.create({
        title: title.trim(),
        body: body.trim() || undefined,
        dueAt: datetimeLocalKyivToIso(dueAt) ?? undefined,
        assigneeId: assigneeId || undefined,
        collaboratorIds: collaboratorIds.length > 0 ? collaboratorIds : undefined,
        ...entityLinkToIds(link),
      });
      onCreated(created);
      scheduleModalClose(onClose);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errors.createFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={() => {
        if (!saving) scheduleModalClose(onClose);
      }}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-zinc-200 bg-white shadow-xl"
        role="dialog"
        aria-modal
        aria-labelledby="task-create-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 id="task-create-title" className="text-lg font-semibold text-zinc-900">
            {t.newTask}
          </h2>
        </div>

        <div className="space-y-3 overflow-y-auto px-5 py-4">
          <div>
            <label className="block text-xs font-medium text-zinc-600">{t.fields.title}</label>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t.fields.titlePlaceholder}
              className="mt-1 w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">{t.fields.due}</label>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">{t.fields.assignee}</label>
            <select
              value={assigneeId}
              onChange={(e) => {
                setAssigneeId(e.target.value);
                setCollaboratorIds((prev) => prev.filter((id) => id !== e.target.value));
              }}
              className="mt-1 w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
            >
              {users.length === 0 && <option value="">{t.noUsers}</option>}
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">{t.collaborators.title}</label>
            <p className="mt-0.5 text-[11px] text-zinc-400">{t.collaborators.addHint}</p>
            <div className="mt-2 max-h-28 space-y-1 overflow-y-auto rounded border border-zinc-200 p-2">
              {users
                .filter((u) => u.id !== assigneeId)
                .map((u) => (
                  <label key={u.id} className="flex items-center gap-2 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      checked={collaboratorIds.includes(u.id)}
                      onChange={(e) => {
                        setCollaboratorIds((prev) =>
                          e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id),
                        );
                      }}
                    />
                    {u.fullName}
                  </label>
                ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">{t.fields.note}</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t.fields.noteOptional}
              rows={2}
              className="mt-1 w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
            />
          </div>
          <TaskEntityLinker
            value={link}
            onChange={setLink}
            disabled={saving}
            lockedType={preset?.lockedType}
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>

        <div className="flex gap-2 border-t border-zinc-200 px-5 py-4">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            className="rounded-lg bg-accent-gradient px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? t.actions.creating : t.actions.create}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => scheduleModalClose(onClose)}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {t.actions.close}
          </button>
        </div>
      </div>
    </div>
  );
}
