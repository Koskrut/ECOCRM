import type { DocumentRefs } from "../../bank/match-engine.utils";

const DOC_NUM = "(\\d{4,8})";

/** Markers common in 1C payment purpose text (incl. abbreviations and №). */
const INVOICE_RE = new RegExp(
  `(?:рахунок|рахунку|рах(?:унка)?|счет|сч[её]т|invoice)\\.?\\s*[№#]?\\s*${DOC_NUM}`,
  "giu",
);

const WAYBILL_RE = new RegExp(
  `(?:видатков(?:а|ої)?\\s+)?(?:накладна|накладної|нак\\.?|рн|вн|waybill)\\.?\\s*[№#]?\\s*${DOC_NUM}`,
  "giu",
);

function pushUnique(list: string[], value: string): void {
  if (!list.includes(value)) list.push(value);
}

/**
 * Extract invoice / waybill numbers from 1C «Формулировка».
 * Broader than bank match-engine: supports «рах.5884», «рах 6209», «№6174» after рахунок.
 */
export function extractOneCDocumentRefs(purpose: string | null | undefined): DocumentRefs {
  if (!purpose?.trim()) return { invoices: [], waybills: [], unlabeled: [] };

  const text = purpose;
  const invoices: string[] = [];
  const waybills: string[] = [];

  for (const m of text.matchAll(INVOICE_RE)) {
    pushUnique(invoices, m[1]!);
  }
  for (const m of text.matchAll(WAYBILL_RE)) {
    pushUnique(waybills, m[1]!);
  }

  return { invoices, waybills, unlabeled: [] };
}
