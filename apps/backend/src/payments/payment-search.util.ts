import { Prisma } from "@prisma/client";

/** Build an OR filter over a Contact relation (firstName/lastName/phone). */
function contactSearchOr(search: string): Prisma.ContactWhereInput {
  const phoneDigits = search.replace(/\D/g, "");
  const parts = search.includes(" ")
    ? search.split(/\s+/).filter(Boolean).slice(0, 2)
    : [];
  return {
    OR: [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      {
        AND: parts.map((part) => ({
          OR: [
            { firstName: { contains: part, mode: "insensitive" as const } },
            { lastName: { contains: part, mode: "insensitive" as const } },
          ],
        })),
      },
      { phone: { contains: search, mode: "insensitive" } },
      ...(phoneDigits.length >= 5
        ? [{ phoneNormalized: { contains: phoneDigits } }]
        : []),
    ],
  };
}

/** Build an OR filter over an Order.orderNumber (exact first for numeric queries). */
function orderNumberOr(search: string): Prisma.OrderWhereInput["OR"] {
  const isNumeric = /^\d+$/.test(search);
  return [
    ...(isNumeric ? [{ orderNumber: { equals: search } }] : []),
    { orderNumber: { contains: search, mode: "insensitive" as const } },
  ];
}

/**
 * Parse a search string as a money amount when it looks like one
 * (e.g. "1500", "1 500,50", "1500.00", "₴1500").
 */
export function parseSearchAmount(search: string): number | null {
  const cleaned = search
    .trim()
    .replace(/\s/g, "")
    .replace(/^[₴$€]+|[₴$€]+$/g, "")
    .replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Search filter for /payments: order number, contact/client name & phone,
 * bank transaction description/counterparty, payment note, and amount.
 */
export function buildPaymentSearchWhere(search: string): Prisma.PaymentWhereInput {
  const amount = parseSearchAmount(search);
  return {
    OR: [
      {
        order: {
          is: {
            OR: [
              ...orderNumberOr(search)!,
              { contact: { is: contactSearchOr(search) } },
              { client: { is: contactSearchOr(search) } },
            ],
          },
        },
      },
      {
        bankTransaction: {
          is: {
            OR: [
              { description: { contains: search, mode: "insensitive" } },
              { counterpartyName: { contains: search, mode: "insensitive" } },
              ...(amount != null ? [{ amount: { equals: amount } }] : []),
            ],
          },
        },
      },
      { note: { contains: search, mode: "insensitive" } },
      ...(amount != null
        ? [{ amount: { equals: amount } }, { amountUsd: { equals: amount } }]
        : []),
    ],
  };
}

/**
 * Search filter for /bank/transactions: description, counterparty, amount,
 * and the order number / contact of any linked payment.
 */
export function buildBankTransactionSearchWhere(
  search: string,
): Prisma.BankTransactionWhereInput {
  const amount = parseSearchAmount(search);
  return {
    OR: [
      { description: { contains: search, mode: "insensitive" } },
      { counterpartyName: { contains: search, mode: "insensitive" } },
      ...(amount != null ? [{ amount: { equals: amount } }] : []),
      {
        payments: {
          some: {
            OR: [
              ...(amount != null
                ? [{ amount: { equals: amount } }, { amountUsd: { equals: amount } }]
                : []),
              {
                order: {
                  is: {
                    OR: [
                      ...orderNumberOr(search)!,
                      { contact: { is: contactSearchOr(search) } },
                      { client: { is: contactSearchOr(search) } },
                    ],
                  },
                },
              },
            ],
          },
        },
      },
    ],
  };
}
