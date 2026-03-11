import { appendFileSync } from "node:fs";
import type { RawBankTransaction } from "./providers/types";
import type { TransactionDirection } from "@prisma/client";

const DEBUG_LOG_PATH = "/Users/konstantin/CRM/.cursor/debug-f04031.log";
function debugLog(msg: string, data: Record<string, unknown> = {}) {
  try {
    appendFileSync(
      DEBUG_LOG_PATH,
      JSON.stringify({ timestamp: Date.now(), location: "privat24.client", message: msg, data }) + "\n",
    );
  } catch (_) {}
}

export type Privat24Credentials = {
  clientId?: string;
  token: string;
  /** Режим групи ПП: id клієнта в групі (обов'язковий для запитів у цьому режимі). */
  id?: string;
};

export type Privat24StatementResult = {
  transactions: RawBankTransaction[];
  nextCursor?: string;
};

/** Official Autoclient API: https://acp.privatbank.ua (docs: Опис API Автоклієнта 3.0) */
const DEFAULT_BASE_URL = "https://acp.privatbank.ua";
const TIMEOUT_MS = 30_000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Format date as DD-MM-YYYY for API query params (startDate, endDate). */
function formatDateDDMMYYYY(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

function parseAmount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return parseFloat(value.replace(/,/g, ".").replace(/\s/g, "")) || 0;
  return 0;
}

function parseDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const s = value.trim();
    // DD.MM.YYYY HH:mm:ss or DD.MM.YYYY or YYYY-MM-DD
    const dotMatch = s.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (dotMatch) {
      const [, d, m, y, h, min, sec] = dotMatch;
      const iso = `${y}-${m}-${d}T${h ?? "00"}:${min ?? "00"}:${sec ?? "00"}.000Z`;
      const date = new Date(iso);
      if (!Number.isNaN(date.getTime())) return date;
    }
    const iso = s.includes("T") ? s : s.includes(".") ? s.replace(/(\d{2})\.(\d{2})\.(\d{4})/, "$3-$2-$1") : `${s}T00:00:00.000Z`;
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

/**
 * Maps Autoclient API transaction to RawBankTransaction.
 * Doc: ID, DAT_OD, DATE_TIME_DAT_OD_TIM_P, SUM, TRANTYPE (D/C), OSND, AUT_CNTR_NAM, CCY, REF, REFN.
 */
function mapStatementItem(row: Record<string, unknown>): RawBankTransaction | null {
  const amountRaw = row.SUM ?? row.sum ?? row.amount ?? row.amountSum ?? row.amt;
  const amount = parseAmount(amountRaw);
  const trantype = (row.TRANTYPE as string) ?? (row.trandc as string) ?? "";
  const direction: TransactionDirection = trantype.toUpperCase() === "C" ? "IN" : "OUT";
  const desc =
    (row.OSND as string) ??
    (row.description as string) ??
    (row.details as string) ??
    (row.purpose as string);
  const dateRaw =
    row.DATE_TIME_DAT_OD_TIM_P ?? row.DAT_OD ?? row.DAT_KL ?? row.date ?? row.dat ?? row.bookedAt;
  const ref = row.REF != null ? String(row.REF) : "";
  const refn = row.REFN != null ? String(row.REFN) : "";
  const externalId =
    (row.ID as string) ??
    (row.TECHNICAL_TRANSACTION_ID as string) ??
    (ref && refn ? `${ref}+${refn}` : null);
  const counterpartyName =
    (row.AUT_CNTR_NAM as string) ??
    (row.counterpartyName as string) ??
    (row.contragent as string);
  const currency = (row.CCY as string) ?? (row.currency as string) ?? "UAH";

  const bookedAt = dateRaw ? parseDate(dateRaw) : new Date();

  return {
    externalId: externalId ?? undefined,
    bookedAt,
    amount: Math.abs(amount),
    currency,
    direction,
    description: desc != null ? String(desc).trim() || undefined : undefined,
    counterpartyName: counterpartyName != null ? String(counterpartyName).trim() || undefined : undefined,
    counterpartyIban: row.AUT_CNTR_ACC != null ? String(row.AUT_CNTR_ACC) : undefined,
    rawPayload: row,
  };
}

/**
 * Client for Privat24 Autoclient API (виписка за рахунками).
 * Doc: https://docs.google.com/document/d/e/2PACX-1vTtKvGa3P4E-lDqLg3bHRF6Wi9S7GIjSMFEFxII5qQZBGxuTXs25hQNiUU1hMZQhOyx6BNvIZ1bVKSr/pub
 * GET /api/statements/transactions?acc=...&startDate=DD-MM-YYYY&endDate=DD-MM-YYYY&followId=...&limit=...
 * Headers: User-Agent, token, Content-Type: application/json;charset=utf-8
 */
export class Privat24Client {
  private static readonly LIMIT = 100;
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = (process.env.PRIVAT24_API_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  /**
   * Fetch transactions for account (acc = IBAN or account number). Paginate with followId.
   */
  async getStatement(
    credentials: Privat24Credentials,
    iban: string,
    from: Date,
    to: Date,
    cursor?: string,
  ): Promise<Privat24StatementResult> {
    const startDate = formatDateDDMMYYYY(from);
    const endDate = formatDateDDMMYYYY(to);
    const acc = iban.replace(/\s/g, "");

    // Використовуємо GroupClientID як значення заголовка `id`.
    // У нашому оточенні це UUID (App ID/Group client ID), який передається ТІЛЬКИ в HTTP header.
    // Якщо окремий credentials.id не заданий, падаємо назад на credentials.clientId.
    const rawId = credentials.id ?? credentials.clientId;
    const providedId = rawId != null && String(rawId).trim() !== "" ? String(rawId).trim() : "";
    const providedIdLooksLikeUuid = providedId ? UUID_RE.test(providedId) : false;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const buildRequest = (withIdHeader: boolean) => {
      const params = new URLSearchParams();
      params.set("acc", acc);
      params.set("startDate", startDate);
      params.set("endDate", endDate);
      params.set("limit", String(Privat24Client.LIMIT));
      if (cursor) params.set("followId", cursor);
      const headers: Record<string, string> = {
        "Content-Type": "application/json;charset=utf-8",
        "User-Agent": "ECOCRM",
        token: credentials.token,
      };
      if (withIdHeader && providedId) {
        headers.id = providedId;
      }
      return { params, headers };
    };

    try {
      // If account has configured GroupClientID, use it first (через header id).
      let withId = !!providedId;
      let { params, headers } = buildRequest(withId);
      const firstUrl = `${this.baseUrl}/api/statements/transactions?${params.toString()}`;
      debugLog("getStatement first request", {
        withIdParam: withId,
        queryHasId: firstUrl.includes("id=") || firstUrl.includes("ID="),
        headerHasId: "id" in headers || "ID" in headers,
        providedIdLooksLikeUuid,
      });
      let res = await fetch(firstUrl, {
        method: "GET",
        headers,
        signal: controller.signal,
      });
      let text = await res.text();

      if (!res.ok && res.status === 400 && /id in mode for companies should not be present/i.test(text) && withId) {
        // Token in non-group mode: retry once without id.
        withId = false;
        ({ params, headers } = buildRequest(false));
        res = await fetch(`${this.baseUrl}/api/statements/transactions?${params.toString()}`, {
          method: "GET",
          headers,
          signal: controller.signal,
        });
        text = await res.text();
      } else if (!res.ok && res.status === 400 && /id is not be null/i.test(text) && !withId && providedId) {
        // Token in group mode: retry once with configured id.
        withId = true;
        ({ params, headers } = buildRequest(true));
        res = await fetch(`${this.baseUrl}/api/statements/transactions?${params.toString()}`, {
          method: "GET",
          headers,
          signal: controller.signal,
        });
        text = await res.text();
      } else if (!res.ok && res.status === 400 && /id is not be null/i.test(text) && !providedId) {
        throw new Error("Приват24 працює в режимі групи ПП. Вкажіть ID для цього ФОП у налаштуваннях рахунку.");
      }

      debugLog("getStatement response", {
        status: res.status,
        ok: res.ok,
        withId,
        providedIdLooksLikeUuid,
        bodyPreview: text.slice(0, 300),
      });

      if (!res.ok) {
        throw new Error(`Privat24 API HTTP ${res.status}. ${text.slice(0, 500)}`);
      }

      const data = JSON.parse(text || "{}") as Record<string, unknown>;

      if ((data.status as string) === "ERROR") {
        throw new Error(
          (data.message as string) || (data.code as string) || "Privat24 API error",
        );
      }

      const list = this.extractTransactionsList(data);
      const nextCursor =
        data.exist_next_page && data.next_page_id != null ? String(data.next_page_id) : undefined;
      const transactions = list
        .map((item) => {
          const row = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
          return mapStatementItem(row);
        })
        .filter((t): t is RawBankTransaction => t !== null);

      debugLog("getStatement parsed", {
        listLength: list.length,
        transactionsCount: transactions.length,
        nextCursor: nextCursor ?? null,
      });

      return { transactions, nextCursor };
    } finally {
      clearTimeout(timeout);
    }
  }

  // Group clients autodiscovery removed by design:
  // use only configured ID for each FOP account.

  private extractTransactionsList(data: unknown): Record<string, unknown>[] {
    if (!data || typeof data !== "object") return [];
    const o = data as Record<string, unknown>;
    const list =
      (o.transactions as Record<string, unknown>[]) ??
      (o.statement as Record<string, unknown>[]) ??
      (o.data as Record<string, unknown>[]) ??
      (o.oper as Record<string, unknown>[]) ??
      (Array.isArray(o.list) ? o.list : null);
    if (Array.isArray(list)) return list;
    if (o.statement && typeof o.statement === "object" && !Array.isArray(o.statement)) {
      const st = o.statement as Record<string, unknown>;
      const inner = st.transactions ?? st.oper ?? st.data;
      return Array.isArray(inner) ? (inner as Record<string, unknown>[]) : [];
    }
    return [];
  }

  private extractNextCursor(data: unknown): string | undefined {
    if (!data || typeof data !== "object") return undefined;
    const o = data as Record<string, unknown>;
    const next = o.exist_next_page ?? o.nextPage ?? o.followId;
    if (typeof next === "string") return next;
    if (typeof next === "number") return String(next);
    return undefined;
  }

  /**
   * Simple XML parsing for statement response when API returns XML.
   */
  private parseStatementXml(xml: string): unknown {
    const rows: Record<string, unknown>[] = [];
    const rowTag = /<row[^>]*>([\s\S]*?)<\/row>/gi;
    let m: RegExpExecArray | null;
    rowTag.lastIndex = 0;
    while ((m = rowTag.exec(xml)) !== null) {
      const block = m[1] ?? "";
      const getVal = (tag: string) => {
        const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
        const match = re.exec(block);
        return match?.[1]?.trim();
      };
      rows.push({
        date: getVal("trandate") ?? getVal("date"),
        amount: getVal("amount") ?? getVal("sum"),
        description: getVal("description") ?? getVal("purpose"),
        counterpartyName: getVal("card") ?? getVal("counterparty"),
        externalId: getVal("appcode") ?? getVal("id"),
      });
    }
    return { transactions: rows };
  }
}
