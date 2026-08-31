"use client";

import Link from "next/link";
import type { Task } from "@/lib/api/resources/tasks";
import { strings } from "@/locales";
import { interpolate } from "@/lib/task-labels";

const t = strings.tasks;

export function TaskLinkedTo({ task }: { task: Task }) {
  const links: { href: string; label: string }[] = [];
  if (task.contactId) {
    const contactName = [task.contact?.lastName, task.contact?.firstName].filter(Boolean).join(" ").trim();
    links.push({
      href: `/contacts?contactId=${task.contactId}`,
      label: contactName
        ? interpolate(t.linkedTo.contactWithName, { name: contactName })
        : t.linkedTo.contact,
    });
  }
  if (task.companyId) {
    links.push({
      href: `/companies?companyId=${task.companyId}`,
      label: task.company?.name
        ? interpolate(t.linkedTo.companyWithName, { name: task.company.name })
        : t.linkedTo.company,
    });
  }
  if (task.leadId) {
    links.push({
      href: `/leads?leadId=${task.leadId}`,
      label: task.lead?.fullName
        ? interpolate(t.linkedTo.leadWithName, { name: task.lead.fullName })
        : t.linkedTo.lead,
    });
  }
  if (task.orderId) {
    links.push({
      href: `/orders?orderId=${task.orderId}`,
      label: task.order?.orderNumber
        ? interpolate(t.linkedTo.orderWithName, { name: task.order.orderNumber })
        : t.linkedTo.order,
    });
  }
  if (links.length === 0) return <span className="text-zinc-500">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="text-zinc-700 underline hover:text-zinc-900"
          onClick={(e) => e.stopPropagation()}
        >
          {l.label}
        </Link>
      ))}
    </span>
  );
}
