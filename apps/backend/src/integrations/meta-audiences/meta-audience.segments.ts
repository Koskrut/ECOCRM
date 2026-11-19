import { orderAmountToUah } from "../../common/currency.util";
import type { ExchangeRates } from "../../settings/settings.service";
import { normalizeAudienceEmail, normalizeAudienceName, normalizeAudiencePhone } from "./meta-audience.normalize";
import type { AudienceKey, AudienceSegment, NormalizedPerson } from "./meta-audience.types";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEBT_EPSILON = 0.009;

export type AudienceOrderInput = {
  id: string;
  clientId: string | null;
  contactId: string | null;
  orderStage: string | null;
  totalAmount: number;
  currency: string | null;
  debtAmount: number | null;
  updatedAt: Date;
  /** Transitions into COMPLETED. The latest one is the purchase date. */
  completedHistory: Date[];
};

export type AudienceContactInput = {
  id: string;
  phone: string | null;
  phoneNormalized: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  marketingCallOptOut: boolean;
};

export type AudienceLeadInput = {
  id: string;
  contactId: string | null;
  status: string;
  phone: string | null;
  phoneNormalized: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  fullName: string | null;
  updatedAt: Date;
};

export type AudienceSource = {
  orders: AudienceOrderInput[];
  contacts: AudienceContactInput[];
  leads: AudienceLeadInput[];
  now: Date;
  lapsedDays: number;
  seedWindowDays: number;
  rates: ExchangeRates | null;
};

type Purchase = {
  orderId: string;
  at: Date;
  totalAmount: number;
  currency: string | null;
};

export function latestCompletionDate(history: Date[] | null | undefined, updatedAt: Date): Date {
  let latest: Date | null = null;
  for (const at of history ?? []) {
    if (!latest || at.getTime() > latest.getTime()) latest = at;
  }
  return latest ?? updatedAt;
}

function isBuyerOrder(order: AudienceOrderInput): boolean {
  if (order.orderStage !== "COMPLETED") return false;
  return Number(order.debtAmount ?? 0) <= DEBT_EPSILON;
}

function personFromContact(contact: AudienceContactInput, value: number | null): NormalizedPerson | null {
  const phone = normalizeAudiencePhone(contact.phone, contact.phoneNormalized);
  const email = normalizeAudienceEmail(contact.email);
  if (!phone && !email) return null;
  return {
    phone,
    email,
    firstName: normalizeAudienceName(contact.firstName),
    lastName: normalizeAudienceName(contact.lastName),
    value,
  };
}

function leadNames(lead: AudienceLeadInput): { firstName: string | null; lastName: string | null } {
  const first = lead.firstName?.trim() || null;
  const last = lead.lastName?.trim() || null;
  if (first || last) return { firstName: first, lastName: last };
  const full = (lead.fullName || lead.name || "").trim();
  if (!full) return { firstName: null, lastName: null };
  const parts = full.split(/\s+/);
  return { firstName: parts[0] || null, lastName: parts.slice(1).join(" ") || null };
}

function hasPhoneText(lead: AudienceLeadInput): boolean {
  return Boolean(lead.phone?.trim() || lead.phoneNormalized?.trim());
}

function lookalikeValue(orders: Purchase[], rates: ExchangeRates | null): number | null {
  const currencies = new Set<string>();
  for (const order of orders) {
    const code = order.currency?.trim().toUpperCase() ?? "";
    if (!code) return null;
    currencies.add(code);
  }
  if (currencies.size !== 1) return null;
  const currency = [...currencies][0];
  const sum = orders.reduce((total, order) => total + Number(order.totalAmount || 0), 0);
  if (!Number.isFinite(sum) || sum <= 0) return null;
  if (currency === "UAH") return Math.round(sum * 100) / 100;
  if (!rates || (currency !== "USD" && currency !== "EUR")) return null;
  const uah = orderAmountToUah(sum, currency, rates);
  if (!Number.isFinite(uah) || uah <= 0) return null;
  return uah;
}

/**
 * buyers_12m: last purchase is inside the seed window and is not past the lapse threshold.
 * A lapsed buyer stays in buyers_all and is absent from buyers_12m.
 * LOOKALIKE_VALUE sums that buyer's completed orders inside the seed window.
 */
export function buildAudienceSegments(source: AudienceSource): Record<AudienceKey, AudienceSegment> {
  const seedCutoff = new Date(source.now.getTime() - source.seedWindowDays * DAY_MS);
  const lapsedCutoff = new Date(source.now.getTime() - source.lapsedDays * DAY_MS);
  const seedStart = seedCutoff.getTime() > lapsedCutoff.getTime() ? seedCutoff : lapsedCutoff;

  const contacts = new Map(source.contacts.map((contact) => [contact.id, contact]));
  const purchases = new Map<string, Purchase[]>();

  for (const order of source.orders) {
    if (!isBuyerOrder(order)) continue;
    const purchase: Purchase = {
      orderId: order.id,
      at: latestCompletionDate(order.completedHistory, order.updatedAt),
      totalAmount: Number(order.totalAmount || 0),
      currency: order.currency,
    };
    for (const contactId of [order.clientId, order.contactId]) {
      if (!contactId || !contacts.has(contactId)) continue;
      const list = purchases.get(contactId) ?? [];
      if (list.some((row) => row.orderId === purchase.orderId)) continue;
      list.push(purchase);
      purchases.set(contactId, list);
    }
  }

  const optOutIds = new Set<string>();
  const optOutPhones = new Set<string>();
  for (const contact of source.contacts) {
    if (!contact.marketingCallOptOut) continue;
    optOutIds.add(contact.id);
    const phone = normalizeAudiencePhone(contact.phone, contact.phoneNormalized);
    if (phone) optOutPhones.add(phone);
  }

  const buyersAll: NormalizedPerson[] = [];
  const buyers12m: NormalizedPerson[] = [];
  const buyersLapsed: NormalizedPerson[] = [];
  const buyerIds = new Set<string>();
  const buyerPhones = new Set<string>();

  const groups = new Map<string, { contactIds: string[]; contacts: AudienceContactInput[]; purchases: Purchase[] }>();
  for (const [contactId, rows] of purchases) {
    const contact = contacts.get(contactId);
    if (!contact) continue;
    const phone = normalizeAudiencePhone(contact.phone, contact.phoneNormalized);
    const key = phone ?? `contact:${contactId}`;
    const group = groups.get(key) ?? { contactIds: [], contacts: [], purchases: [] };
    group.contactIds.push(contactId);
    group.contacts.push(contact);
    for (const row of rows) {
      if (!group.purchases.some((item) => item.orderId === row.orderId)) group.purchases.push(row);
    }
    groups.set(key, group);
  }

  for (const [key, group] of groups) {
    const phone = key.startsWith("contact:") ? null : key;
    if (group.contacts.some((contact) => contact.marketingCallOptOut)) {
      for (const id of group.contactIds) optOutIds.add(id);
      if (phone) optOutPhones.add(phone);
      continue;
    }
    const rows = group.purchases;
    const last = rows.reduce((max, row) => (row.at.getTime() > max.getTime() ? row.at : max), rows[0].at);
    const inLapsed = last.getTime() < lapsedCutoff.getTime();
    const inSeed = last.getTime() >= seedStart.getTime();
    const windowOrders = rows.filter((row) => row.at.getTime() >= seedCutoff.getTime());
    const contact =
      group.contacts.find((item) => normalizeAudienceEmail(item.email)) ?? group.contacts[0];
    const person = personFromContact(contact, inSeed ? lookalikeValue(windowOrders, source.rates) : null);
    if (!person) continue;
    if (phone) person.phone = phone;

    for (const id of group.contactIds) buyerIds.add(id);
    if (phone) buyerPhones.add(phone);
    buyersAll.push({ ...person, value: null });
    if (inSeed) buyers12m.push(person);
    if (inLapsed) buyersLapsed.push({ ...person, value: null });
  }

  const leadsByKey = new Map<string, { at: number; person: NormalizedPerson }>();
  for (const lead of source.leads) {
    if (lead.status === "SPAM" || lead.status === "NOT_TARGET") continue;
    if (!hasPhoneText(lead)) continue;
    if (lead.contactId && (optOutIds.has(lead.contactId) || buyerIds.has(lead.contactId))) continue;
    const phone = normalizeAudiencePhone(lead.phone, lead.phoneNormalized);
    if (phone && (optOutPhones.has(phone) || buyerPhones.has(phone))) continue;
    const email = normalizeAudienceEmail(lead.email);
    if (!phone && !email) continue;
    const names = leadNames(lead);
    const person: NormalizedPerson = {
      phone,
      email,
      firstName: normalizeAudienceName(names.firstName),
      lastName: normalizeAudienceName(names.lastName),
      value: null,
    };
    const rawPhone = (lead.phone || lead.phoneNormalized || "").trim();
    const key = phone ?? (rawPhone ? `raw:${rawPhone}` : `lead:${lead.id}`);
    const at = lead.updatedAt.getTime();
    const current = leadsByKey.get(key);
    if (!current || at >= current.at) leadsByKey.set(key, { at, person });
  }

  return {
    buyers_12m: { people: buyers12m },
    buyers_all: { people: buyersAll },
    buyers_lapsed: { people: buyersLapsed },
    leads_no_order: { people: [...leadsByKey.values()].map((row) => row.person) },
  };
}
