"use client";

import { Pencil, Phone } from "lucide-react";
import type { ContactWorkQueueItem } from "@/lib/api/resources/contacts";
import { isTextSelected } from "@/lib/dom";
import { formatDate } from "@/lib/crmDatetime";
import { normalizePhone } from "@/lib/formatPhone";
import { strings } from "@/locales";
import { shouldActivateRowKey } from "./contacts-a11y";
import {
  formatContactClientStage,
  formatContactNextActionType,
  formatContactPriorityReasonCompact,
  formatDaysSinceLastContact,
  scoreTone,
} from "./contact-formatters";

export { shouldActivateRowKey } from "./contacts-a11y";

type OpenContact = (id: string) => void;

function QuickActions({ phone, onOpen }: { phone: string | null | undefined; onOpen: () => void }) {
  const t = strings.contacts.page;
  return (
    <div
      className="flex shrink-0 items-center justify-end gap-1"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <a
        href={phone ? `tel:${normalizePhone(phone) ?? phone.replace(/\s/g, "")}` : undefined}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`rounded p-2 transition-colors ${
          phone
            ? "text-zinc-600 hover:bg-emerald-100 hover:text-emerald-700"
            : "cursor-not-allowed text-zinc-300"
        }`}
        title={t.call}
        aria-label={t.call}
      >
        <Phone className="h-4 w-4" />
      </a>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        className="rounded p-2 text-zinc-600 transition-colors hover:bg-zinc-200 hover:text-zinc-900"
        title={t.open}
        aria-label={t.open}
      >
        <Pencil className="h-4 w-4" />
      </button>
    </div>
  );
}

export function WorkQueueMobileCard({
  item,
  openContact,
}: {
  item: ContactWorkQueueItem;
  openContact: OpenContact;
}) {
  const wq = strings.contacts.workQueue;
  const nextAction = formatContactNextActionType(item.contact.nextActionType);
  const nextDate = item.contact.nextActionAt ? formatDate(item.contact.nextActionAt) : "—";

  return (
    <article
      className="bg-white px-3 py-3 transition-all hover:bg-zinc-50/60"
      onClick={() => {
        if (isTextSelected()) return;
        openContact(item.contact.id);
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-zinc-900">
            {item.contact.fullName || wq.noName}
          </div>
          <div className="mt-1 text-sm text-zinc-800">
            <span className="font-medium">{nextAction}</span>
            <span className="text-zinc-400"> · </span>
            <span className="text-zinc-600">{nextDate}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${scoreTone(item.priorityScore)}`}
            >
              {wq.score.replace("{score}", String(item.priorityScore))}
            </span>
            {item.metrics.debtAmount > 0 ? (
              <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                {wq.debt.replace("{amount}", String(item.metrics.debtAmount))}
              </span>
            ) : null}
          </div>
          <div className="mt-1 truncate text-xs text-zinc-500">
            {[item.contact.companyName, item.contact.ownerName].filter(Boolean).join(" · ") || "—"}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {wq.lastContact}: {formatDaysSinceLastContact(item.metrics.daysSinceLastContact)}
            {" · "}
            {wq.stage}: {formatContactClientStage(item.contact.clientStage)}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {item.priorityReasons.slice(0, 3).map((reason) => (
              <span
                key={reason}
                className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-700"
              >
                {formatContactPriorityReasonCompact(reason)}
              </span>
            ))}
          </div>
        </div>
        <QuickActions phone={item.contact.phone} onOpen={() => openContact(item.contact.id)} />
      </div>
    </article>
  );
}

export function WorkQueueDesktopRow({
  item,
  openContact,
}: {
  item: ContactWorkQueueItem;
  openContact: OpenContact;
}) {
  const wq = strings.contacts.workQueue;

  return (
    <tr
      className="cursor-pointer align-top transition-colors hover:bg-zinc-50 focus-within:bg-zinc-50"
      onClick={() => {
        if (isTextSelected()) return;
        openContact(item.contact.id);
      }}
      tabIndex={0}
      onKeyDown={(e) => {
        if (!shouldActivateRowKey(e)) return;
        e.preventDefault();
        openContact(item.contact.id);
      }}
    >
      <td className="px-3 py-3.5">
        <div className="font-medium text-zinc-900">{item.contact.fullName || wq.noName}</div>
        <div className="mt-1 text-xs text-zinc-500">{item.contact.companyName ?? "—"}</div>
      </td>
      <td className="px-3 py-3.5 text-sm text-zinc-600">{item.contact.ownerName ?? "—"}</td>
      <td className="px-3 py-3.5 text-right">
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${scoreTone(item.priorityScore)}`}
        >
          {item.priorityScore}
        </span>
      </td>
      <td className="px-3 py-3.5">
        <div className="flex flex-wrap gap-1">
          {item.priorityReasons.slice(0, 3).map((reason) => (
            <span
              key={reason}
              className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium leading-none text-zinc-700"
            >
              {formatContactPriorityReasonCompact(reason)}
            </span>
          ))}
        </div>
      </td>
      <td className="px-3 py-3.5 text-sm text-zinc-600">
        {formatContactClientStage(item.contact.clientStage)}
      </td>
      <td className="px-3 py-3.5 text-sm text-zinc-800">
        <span className="font-medium">
          {formatContactNextActionType(item.contact.nextActionType)}
        </span>
      </td>
      <td className="px-3 py-3.5 text-sm text-zinc-600">
        {item.contact.nextActionAt ? formatDate(item.contact.nextActionAt) : "—"}
      </td>
      <td className="px-3 py-3.5 text-sm text-zinc-600">
        {formatDaysSinceLastContact(item.metrics.daysSinceLastContact)}
      </td>
      <td className="px-3 py-3.5 text-right text-sm text-zinc-600">
        {item.metrics.debtAmount > 0 ? (
          <span className="font-medium text-amber-700">{item.metrics.debtAmount}</span>
        ) : (
          "—"
        )}
      </td>
      <td className="px-2 py-3.5 text-right">
        <QuickActions phone={item.contact.phone} onOpen={() => openContact(item.contact.id)} />
      </td>
    </tr>
  );
}
