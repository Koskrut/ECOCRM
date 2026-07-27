import type { BankIgnoreCategory } from "@prisma/client";

export type ClassifierInput = {
  description?: string | null;
  counterpartyName?: string | null;
  counterpartyIban?: string | null;
};

export type OwnAccountHint = {
  iban?: string | null;
  name?: string | null;
  legalName?: string | null;
};

export type ClassifyResult = {
  category: BankIgnoreCategory;
};

/** Own-company counterparty patterns (optional whitelist). */
const OWN_COMPANY_PATTERNS = [
  /ей\s*б[іi]\s*ем/i,
  /ейбієм/i,
  /abm\s*techno/i,
  /тов\s*["«']?\s*а[\s.]*б[\s.]*м/i,
];

const BANK_FEE_PATTERNS = [
  /дебетуван/i,
  /ком[іi]с[іi][яю]/i,
  /комисси/i,
  /обслуговуван/i,
  /обслуговування\s+рахунк/i,
  /за\s+виконання\s+платеж/i,
];

const TAX_PATTERNS = [
  /дксу/i,
  /\bдпс\b/i,
  /єдиний\s+податок/i,
  /\bєп\b/i,
  /в[іi]йськов(ий|ого)\s+зб[іi]р/i,
  /\bвз\b/i,
  /єсв/i,
  /единий\s+соц/i,
];

const CASH_PATTERNS = [
  /каса\s+приват/i,
  /знятт[яю]\s+гот[іi]вк/i,
  /знятт[яю]\s+кошт/i,
  /ком[іi]с[іi][яю].*знятт/i,
];

/** Privat transit — real client payments; never auto-ignore. */
const TRANSIT_PATTERNS = [
  /транз\.?\s*рахун/i,
  /транз/i,
  /платеж[іi]_/i,
];

export function normalizeBankText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[''`ʹʼ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeIban(iban: string | null | undefined): string | null {
  const raw = (iban ?? "").replace(/\s+/g, "").toUpperCase();
  return raw.length >= 15 ? raw : null;
}

export function isPrivatTransit(input: ClassifierInput): boolean {
  const hay = `${input.counterpartyName ?? ""} ${input.description ?? ""}`;
  return TRANSIT_PATTERNS.some((re) => re.test(hay));
}

function matchesAny(hay: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(hay));
}

/**
 * Pure classification rules for non-client bank noise.
 * Returns null when the transaction should stay matchable.
 */
export function classifyBankTransaction(
  input: ClassifierInput,
  ownAccounts: OwnAccountHint[] = [],
): ClassifyResult | null {
  if (isPrivatTransit(input)) return null;

  const hay = `${input.counterpartyName ?? ""} ${input.description ?? ""}`;
  const hayNorm = normalizeBankText(hay);

  if (matchesAny(hay, BANK_FEE_PATTERNS) || matchesAny(hayNorm, BANK_FEE_PATTERNS)) {
    return { category: "BANK_FEE" };
  }

  if (matchesAny(hay, TAX_PATTERNS) || matchesAny(hayNorm, TAX_PATTERNS)) {
    return { category: "TAX" };
  }

  if (matchesAny(hay, CASH_PATTERNS) || matchesAny(hayNorm, CASH_PATTERNS)) {
    return { category: "CASH_WITHDRAWAL" };
  }

  if (OWN_COMPANY_PATTERNS.some((re) => re.test(hay) || re.test(hayNorm))) {
    return { category: "OWN_COMPANY" };
  }

  const txIban = normalizeIban(input.counterpartyIban);
  if (txIban) {
    const ownIbans = new Set(
      ownAccounts.map((a) => normalizeIban(a.iban)).filter((v): v is string => !!v),
    );
    if (ownIbans.has(txIban)) {
      return { category: "OWN_TRANSFER" };
    }
  }

  const ownNames = ownAccounts
    .flatMap((a) => [a.name, a.legalName])
    .map((n) => normalizeBankText(n))
    .filter((n) => n.length >= 4);

  if (ownNames.length > 0) {
    const counterpartyNorm = normalizeBankText(input.counterpartyName);
    const descNorm = normalizeBankText(input.description);
    for (const name of ownNames) {
      if (
        (counterpartyNorm && (counterpartyNorm.includes(name) || name.includes(counterpartyNorm))) ||
        (descNorm && descNorm.includes(name))
      ) {
        return { category: "OWN_TRANSFER" };
      }
    }
  }

  return null;
}
