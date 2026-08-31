"use client";

import { useCallback, useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { formatPhoneDisplay } from "@/lib/formatPhone";
import { strings } from "@/locales";
import { interpolate, taskLinkedTypeLabel } from "@/lib/task-labels";

const t = strings.tasks;

export type TaskEntityType = "contact" | "company" | "lead" | "order";

export type TaskEntityLinkValue = {
  type: TaskEntityType;
  id: string;
  label: string;
} | null;

type Props = {
  value: TaskEntityLinkValue;
  onChange: (next: TaskEntityLinkValue) => void;
  disabled?: boolean;
  /** When set, lock the type (e.g. create from contact card). */
  lockedType?: TaskEntityType;
};

type SearchOption = { id: string; label: string };

export function TaskEntityLinker({ value, onChange, disabled, lockedType }: Props) {
  const [linkType, setLinkType] = useState<TaskEntityType>(value?.type ?? lockedType ?? "contact");
  const [linkSearch, setLinkSearch] = useState(value?.label ?? "");
  const [linkOptions, setLinkOptions] = useState<SearchOption[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);

  useEffect(() => {
    if (lockedType) setLinkType(lockedType);
  }, [lockedType]);

  useEffect(() => {
    setLinkSearch(value?.label ?? "");
    if (value?.type) setLinkType(value.type);
  }, [value?.id, value?.label, value?.type]);

  const searchEntities = useCallback(async () => {
    if (!linkSearch.trim() || (value && linkSearch === value.label)) {
      setLinkOptions([]);
      return;
    }
    setLinkSearching(true);
    try {
      if (linkType === "contact") {
        const r = await apiHttp.get<{ items: { id: string; firstName: string; lastName: string; phone: string }[] }>(
          "/contacts",
          { params: { q: linkSearch, page: 1, pageSize: 20 } } as never,
        );
        const list = r.data?.items ?? [];
        setLinkOptions(
          list.map((c) => ({
            id: c.id,
            label: `${c.lastName} ${c.firstName} — ${formatPhoneDisplay(c.phone)}`,
          })),
        );
      } else if (linkType === "company") {
        const r = await apiHttp.get<{ items: { id: string; name: string }[] }>("/companies", {
          params: { search: linkSearch, page: 1, pageSize: 20 },
        } as never);
        setLinkOptions((r.data?.items ?? []).map((c) => ({ id: c.id, label: c.name })));
      } else if (linkType === "lead") {
        const r = await apiHttp.get<{
          items: { id: string; fullName: string | null; phone: string | null; companyName: string | null }[];
        }>("/leads", { params: { q: linkSearch, page: 1, pageSize: 20 } } as never);
        setLinkOptions(
          (r.data?.items ?? []).map((l) => ({
            id: l.id,
            label:
              [l.fullName, l.phone ? formatPhoneDisplay(l.phone) : null, l.companyName]
                .filter(Boolean)
                .join(" — ") || l.id,
          })),
        );
      } else {
        const r = await apiHttp.get<{ items: { id: string; orderNumber: string }[] }>("/orders", {
          params: { q: linkSearch.trim() || undefined, page: 1, pageSize: 20 },
        } as never);
        setLinkOptions((r.data?.items ?? []).map((o) => ({ id: o.id, label: o.orderNumber })));
      }
    } catch {
      setLinkOptions([]);
    } finally {
      setLinkSearching(false);
    }
  }, [linkType, linkSearch, value]);

  useEffect(() => {
    const timer = setTimeout(() => void searchEntities(), 300);
    return () => clearTimeout(timer);
  }, [searchEntities]);

  return (
    <div>
      <label className="block text-xs font-medium text-zinc-600">
        {t.fields.linkTo} <span className="font-normal text-zinc-400">({t.fields.linkOptional})</span>
      </label>
      <div className="mt-1 flex gap-2">
        <select
          value={linkType}
          disabled={disabled || !!lockedType}
          onChange={(e) => {
            setLinkType(e.target.value as TaskEntityType);
            setLinkSearch("");
            setLinkOptions([]);
            onChange(null);
          }}
          className="rounded border border-zinc-200 px-2 py-1.5 text-sm disabled:opacity-60"
        >
          <option value="contact">{t.linkedTo.contact}</option>
          <option value="company">{t.linkedTo.company}</option>
          <option value="lead">{t.linkedTo.lead}</option>
          <option value="order">{t.linkedTo.order}</option>
        </select>
        <input
          type="text"
          value={linkSearch}
          disabled={disabled}
          onChange={(e) => {
            setLinkSearch(e.target.value);
            if (value) onChange(null);
          }}
          placeholder={interpolate(t.fields.searchLink, { type: taskLinkedTypeLabel(linkType) })}
          className="min-w-0 flex-1 rounded border border-zinc-200 px-2 py-1.5 text-sm disabled:opacity-60"
        />
      </div>
      {value ? (
        <div className="mt-1 flex items-center gap-2 text-xs text-zinc-600">
          <span className="truncate">{value.label}</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onChange(null);
              setLinkSearch("");
              setLinkOptions([]);
            }}
            className="shrink-0 text-zinc-500 underline hover:text-zinc-800 disabled:opacity-50"
          >
            {t.actions.clearLink}
          </button>
        </div>
      ) : null}
      {linkOptions.length > 0 && (
        <ul className="mt-1 max-h-40 overflow-auto rounded border border-zinc-200 bg-white">
          {linkOptions.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  onChange({ type: linkType, id: o.id, label: o.label });
                  setLinkSearch(o.label);
                  setLinkOptions([]);
                }}
                className="w-full px-2 py-1.5 text-left text-sm hover:bg-zinc-100"
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {linkSearching ? <p className="mt-1 text-xs text-zinc-500">{t.searching}</p> : null}
    </div>
  );
}

export function entityLinkToIds(link: TaskEntityLinkValue): {
  contactId?: string;
  companyId?: string;
  leadId?: string;
  orderId?: string;
} {
  if (!link) return {};
  if (link.type === "contact") return { contactId: link.id };
  if (link.type === "company") return { companyId: link.id };
  if (link.type === "lead") return { leadId: link.id };
  return { orderId: link.id };
}

export function taskToEntityLink(task: {
  contactId?: string | null;
  companyId?: string | null;
  leadId?: string | null;
  orderId?: string | null;
  contact?: { firstName?: string; lastName?: string } | null;
  company?: { name?: string } | null;
  lead?: { fullName?: string | null } | null;
  order?: { orderNumber?: string } | null;
}): TaskEntityLinkValue {
  if (task.contactId) {
    const name = [task.contact?.lastName, task.contact?.firstName].filter(Boolean).join(" ").trim();
    return { type: "contact", id: task.contactId, label: name || t.linkedTo.contact };
  }
  if (task.companyId) {
    return { type: "company", id: task.companyId, label: task.company?.name || t.linkedTo.company };
  }
  if (task.leadId) {
    return { type: "lead", id: task.leadId, label: task.lead?.fullName || t.linkedTo.lead };
  }
  if (task.orderId) {
    return { type: "order", id: task.orderId, label: task.order?.orderNumber || t.linkedTo.order };
  }
  return null;
}
