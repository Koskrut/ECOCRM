"use client";

import { useState } from "react";
import { ClipboardList, Link2, ShoppingCart, User, UserPlus } from "lucide-react";
import {
  useContactCardSummary,
  type ContactCardSummary,
} from "@/app/contacts/card/useContactCardSummary";
import { ContactTelegramAccounts } from "@/components/contacts/ContactTelegramAccounts";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    maximumFractionDigits: 0,
  }).format(n);
}

function badgeLabel(code: string): string {
  const map: Record<string, string> = {
    debt: "Борг",
    overdue: "Прострочення",
    open_overdue_tasks: "Простр. задачі",
    unassigned: "Без відповідального",
    no_company: "Без компанії",
    no_activity: "Без активності",
    credit: "Переплата",
  };
  return map[code] ?? code;
}

type ContactBrief = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
};

type LeadBrief = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  phone: string | null;
};

type StaffOption = { id: string; fullName: string };

type AssignBlock = {
  assignedTo: { id: string; fullName: string } | null;
  collaborators?: StaffOption[];
  staffOptions?: StaffOption[];
  meId: string | null;
  meRole?: string | null;
  assignLoading?: boolean;
  onAssign: (userId: string | null) => void;
  onAddCollaborator?: (userId: string) => void;
  onRemoveCollaborator?: (userId: string) => void;
};

type LinkBlock = {
  linkModalOpen: boolean;
  linkSearch: string;
  linkSearching: boolean;
  linkResults: Array<{ id: string; firstName: string; lastName: string; phone: string }>;
  linkContactLoading: boolean;
  createContactLoading: boolean;
  onOpenLink: () => void;
  onCloseLink: () => void;
  onLinkSearchChange: (v: string) => void;
  onLinkContact: (contactId: string) => void;
  onCreateContact: () => void;
};

type Props = {
  contact: ContactBrief | null;
  lead: LeadBrief | null;
  conversationId?: string | null;
  telegramChatId?: string | null;
  onTelegramLinksChanged?: () => void;
  assign?: AssignBlock | null;
  link?: LinkBlock | null;
  onCreateTask: () => void;
  onCreateOrder?: () => void;
  creatingOrder?: boolean;
  mobileBack?: () => void;
  unlinkedLabel?: string;
};

function ContactContextCard({ summary }: { summary: ContactCardSummary }) {
  const chips = [
    summary.contact.clientType,
    summary.contact.status,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-2">
      {chips.length > 0 || summary.contact.badges.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {chips.map((c) => (
            <span
              key={c}
              className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-700"
            >
              {c}
            </span>
          ))}
          {summary.contact.badges.map((b) => (
            <span
              key={b}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                b === "debt" || b === "overdue"
                  ? "bg-red-100 text-red-700"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {badgeLabel(b)}
            </span>
          ))}
        </div>
      ) : null}

      {!summary.insights.financeRestricted ? (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded border border-zinc-100 bg-zinc-50 p-2">
            <p className="text-zinc-500">Замовлення</p>
            <p className="font-semibold text-zinc-900">{summary.kpi.ordersCount}</p>
          </div>
          <div className="rounded border border-zinc-100 bg-zinc-50 p-2">
            <p className="text-zinc-500">Дебіторка</p>
            <p
              className={`font-semibold ${
                summary.kpi.debt > 0 ? "text-red-700" : "text-zinc-900"
              }`}
            >
              {formatMoney(summary.kpi.debt)}
            </p>
          </div>
        </div>
      ) : null}

      {summary.insights.nextStep || summary.kpi.openTasksCount > 0 ? (
        <div className="rounded border border-zinc-100 bg-white p-2 text-xs">
          <p className="text-zinc-500">Завдання</p>
          <p className="mt-0.5 text-zinc-800">
            Відкритих: {summary.kpi.openTasksCount}
            {summary.kpi.overdueTasksCount > 0
              ? ` · простр.: ${summary.kpi.overdueTasksCount}`
              : ""}
          </p>
          {summary.insights.nextStep ? (
            <p className="mt-1 font-medium text-zinc-900">
              → {summary.insights.nextStep.title}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function assignmentRights(assign: AssignBlock) {
  const isLeadOrAdmin = assign.meRole === "ADMIN" || assign.meRole === "LEAD";
  const isAssignee = Boolean(assign.assignedTo && assign.assignedTo.id === assign.meId);
  return {
    canClaim: !assign.assignedTo && Boolean(assign.meId),
    canTransfer: isLeadOrAdmin || isAssignee,
    canUnassign: Boolean(assign.assignedTo) && (isLeadOrAdmin || isAssignee),
    canInvite: isLeadOrAdmin || isAssignee,
  };
}

function LinkContactPanel({ link }: { link: LinkBlock }) {
  if (!link.linkModalOpen) return null;
  return (
    <div className="mt-3 rounded border border-zinc-200 bg-zinc-50 p-2">
      <input
        type="text"
        value={link.linkSearch}
        onChange={(e) => link.onLinkSearchChange(e.target.value)}
        placeholder="Пошук контакту…"
        className="w-full rounded border border-zinc-200 px-2 py-1.5 text-sm outline-none"
        autoFocus
      />
      {link.linkSearching ? <p className="mt-1 text-xs text-zinc-500">Пошук…</p> : null}
      {!link.linkSearching && link.linkSearch.trim() && link.linkResults.length === 0 ? (
        <p className="mt-1 text-xs text-zinc-500">Нічого не знайдено</p>
      ) : null}
      <ul className="mt-2 max-h-32 overflow-y-auto">
        {link.linkResults.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => void link.onLinkContact(c.id)}
              disabled={link.linkContactLoading}
              className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-zinc-200 disabled:opacity-50"
            >
              {c.lastName} {c.firstName} — {c.phone}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={link.onCloseLink}
        className="mt-2 text-xs text-zinc-500 hover:underline"
      >
        Скасувати
      </button>
    </div>
  );
}

export function InboxClientCard({
  contact,
  lead,
  conversationId,
  telegramChatId,
  onTelegramLinksChanged,
  assign,
  link,
  onCreateTask,
  onCreateOrder,
  creatingOrder,
  mobileBack,
  unlinkedLabel,
}: Props) {
  const summary = useContactCardSummary(contact?.id ?? "", !!contact?.id);
  const [localCreating, setLocalCreating] = useState(false);
  const busy = creatingOrder || localCreating;
  const rights = assign ? assignmentRights(assign) : null;

  const handleCreateOrder = async () => {
    if (!onCreateOrder) return;
    setLocalCreating(true);
    try {
      await onCreateOrder();
    } finally {
      setLocalCreating(false);
    }
  };

  return (
    <div className="space-y-3">
      {mobileBack ? (
        <button
          type="button"
          onClick={mobileBack}
          className="mb-1 self-start rounded-md border border-zinc-200 px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-100 md:hidden"
        >
          ← До чату
        </button>
      ) : null}

      <h4 className="text-sm font-medium text-zinc-700">Картка</h4>

      {assign ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-3 text-sm space-y-3">
          <div>
            <p className="text-xs text-zinc-500">Відповідальний</p>
            <p className="mt-0.5 font-medium text-zinc-900">
              {assign.assignedTo?.fullName ?? "Не призначено"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {rights?.canClaim ? (
                <button
                  type="button"
                  onClick={() => assign.meId && assign.onAssign(assign.meId)}
                  disabled={assign.assignLoading || !assign.meId}
                  className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Взяти собі
                </button>
              ) : null}
              {rights?.canUnassign ? (
                <button
                  type="button"
                  onClick={() => assign.onAssign(null)}
                  disabled={assign.assignLoading}
                  className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Зняти
                </button>
              ) : null}
            </div>
            {rights?.canTransfer && assign.staffOptions && assign.staffOptions.length > 0 ? (
              <label className="mt-2 block text-xs text-zinc-500">
                Передати менеджеру
                <select
                  className="mt-1 w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900"
                  disabled={assign.assignLoading}
                  defaultValue=""
                  onChange={(e) => {
                    const id = e.target.value;
                    e.target.value = "";
                    if (id) assign.onAssign(id);
                  }}
                >
                  <option value="">Оберіть…</option>
                  {assign.staffOptions
                    .filter((u) => u.id !== assign.assignedTo?.id)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
          </div>

          <div>
            <p className="text-xs text-zinc-500">Спільно (доступ до чату)</p>
            {(assign.collaborators ?? []).length > 0 ? (
              <ul className="mt-1 space-y-1">
                {(assign.collaborators ?? []).map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center justify-between gap-2 text-sm text-zinc-800"
                  >
                    <span>{u.fullName}</span>
                    {assign.onRemoveCollaborator && (u.id === assign.meId || rights?.canInvite) ? (
                      <button
                        type="button"
                        disabled={assign.assignLoading}
                        onClick={() => assign.onRemoveCollaborator?.(u.id)}
                        className="text-xs text-zinc-500 hover:text-zinc-800 disabled:opacity-50"
                      >
                        Прибрати
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-0.5 text-xs text-zinc-400">Нікого не додано</p>
            )}
            {rights?.canInvite && assign.staffOptions && assign.onAddCollaborator ? (
              <label className="mt-2 block text-xs text-zinc-500">
                Додати до спільної роботи
                <select
                  className="mt-1 w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900"
                  disabled={assign.assignLoading}
                  defaultValue=""
                  onChange={(e) => {
                    const id = e.target.value;
                    e.target.value = "";
                    if (id) assign.onAddCollaborator?.(id);
                  }}
                >
                  <option value="">Оберіть…</option>
                  {assign.staffOptions
                    .filter(
                      (u) =>
                        u.id !== assign.assignedTo?.id &&
                        !(assign.collaborators ?? []).some((c) => c.id === u.id),
                    )
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
          </div>
        </div>
      ) : null}

      {contact ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-3 text-sm space-y-2">
          <p className="font-medium text-zinc-900">
            {contact.lastName} {contact.firstName}
          </p>
          <p className="text-zinc-600">{contact.phone}</p>
          {summary.loading ? (
            <p className="text-xs text-zinc-500">Завантаження…</p>
          ) : summary.data ? (
            <ContactContextCard summary={summary.data} />
          ) : null}
          <a
            href={`/contacts?contactId=${contact.id}`}
            className="inline-block text-xs text-blue-600 hover:underline"
          >
            Відкрити контакт →
          </a>
          <ContactTelegramAccounts
            contactId={contact.id}
            conversationId={conversationId}
            currentChatId={telegramChatId}
            onChanged={onTelegramLinksChanged}
          />
        </div>
      ) : null}

      {lead && !contact ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-3 text-sm">
          <p className="font-medium text-zinc-900">
            {lead.fullName ||
              [lead.lastName, lead.firstName].filter(Boolean).join(" ") ||
              "Лід"}
          </p>
          {lead.phone ? <p className="mt-1 text-zinc-600">{lead.phone}</p> : null}
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href={`/leads?leadId=${lead.id}`}
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              Відкрити лід →
            </a>
            {link ? (
              <>
                <button
                  type="button"
                  onClick={link.onOpenLink}
                  disabled={link.linkContactLoading}
                  className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  <Link2 className="h-3 w-3" />
                  Прив&apos;язати до контакту
                </button>
                <button
                  type="button"
                  onClick={link.onCreateContact}
                  disabled={link.createContactLoading || !lead.phone}
                  title={
                    !lead.phone
                      ? "Додайте телефон до ліда"
                      : "Створити контакт з даних ліда"
                  }
                  className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  <UserPlus className="h-3 w-3" />
                  {link.createContactLoading ? "…" : "Створити контакт"}
                </button>
              </>
            ) : null}
          </div>
          {link ? <LinkContactPanel link={link} /> : null}
        </div>
      ) : null}

      {!contact && !lead ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-3 text-center text-sm text-zinc-500">
          <User className="mx-auto h-10 w-10 text-zinc-300" />
          <p className="mt-2">{unlinkedLabel ?? "Чат без прив'язки"}</p>
          {link ? (
            <div className="mt-3 text-left">
              <button
                type="button"
                onClick={link.onOpenLink}
                disabled={link.linkContactLoading}
                className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                <Link2 className="h-3 w-3" />
                Прив&apos;язати до контакту
              </button>
              <LinkContactPanel link={link} />
            </div>
          ) : null}
        </div>
      ) : null}

      {(contact || lead) && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onCreateTask}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
          >
            <ClipboardList className="h-3.5 w-3.5" />
            Поставити завдання
          </button>
          {contact && onCreateOrder ? (
            <button
              type="button"
              onClick={() => void handleCreateOrder()}
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              {busy ? "Створення…" : "Створити замовлення"}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
