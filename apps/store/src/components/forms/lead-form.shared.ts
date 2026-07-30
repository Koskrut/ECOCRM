"use client";

import { getAttributionSnapshot } from "@/lib/attribution";
import { normalizePhone } from "@/lib/formatPhone";

export const ROLE_OPTIONS = [
  { value: "clinic", label: "Клініка" },
  { value: "doctor", label: "Лікар" },
  { value: "lab", label: "Лабораторія" },
  { value: "dealer", label: "Дилер / партнер" },
  { value: "other", label: "Інше" },
];

export const inputClass =
  "mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2.5 text-zinc-900 outline-none transition focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]";

/** Phone is required; email is optional but must be valid when provided. */
export function validateRequiredPhone(phone: string, email: string): string | null {
  if (!normalizePhone(phone)) return "Вкажіть телефон";
  const emailTrim = email.trim();
  if (emailTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) return "Невірний формат email";
  return null;
}

type SubmitLeadParams = {
  name: string;
  phone: string;
  email: string;
  company?: string;
  roleSegment: string;
  message?: string;
  formType: "short_lead" | "compatibility_request" | "consultation_request";
  consent: boolean;
};

export async function submitLead(params: SubmitLeadParams) {
  const attribution = getAttributionSnapshot();
  const res = await fetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...params,
      attribution,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string; leadId?: string };
  if (!res.ok) {
    throw new Error(data.message ?? "Не вдалося надіслати форму");
  }
  return data;
}
