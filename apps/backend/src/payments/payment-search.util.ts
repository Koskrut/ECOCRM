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
 * Search filter for /payments: order number, contact/client name & phone,
 * bank transaction description/counterparty, and payment note.
 */
export function buildPaymentSearchWhere(search: string): Prisma.PaymentWhereInput {
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
            ],
          },
        },
      },
      { note: { contains: search, mode: "insensitive" } },
    ],
  };
}

/**
 * Search filter for /bank/transactions: description, counterparty, and the
 * order number / contact of any linked payment.
 */
export function buildBankTransactionSearchWhere(
  search: string,
): Prisma.BankTransactionWhereInput {
  return {
    OR: [
      { description: { contains: search, mode: "insensitive" } },
      { counterpartyName: { contains: search, mode: "insensitive" } },
      {
        payments: {
          some: {
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
        },
      },
    ],
  };
}
