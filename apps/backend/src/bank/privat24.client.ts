import { DateTime } from "luxon";
import type { RawBankTransaction } from "./providers/types";
import type { TransactionDirection } from "@prisma/client";
import { CRM_TIME_ZONE } from "../crm-timezone";

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

export type Privat24SettingsResult = {
  phase?: string;
  work_balance?: string;
  today?: string;
  lastday?: string;
  date_final_statement?: string;
  requestId?: string;
  serviceCode?: string;
};

export class Privat24StatementSkipError extends Error {
  readonly reason: string;
  readonly statusCode?: number;
  readonly requestId?: string;
  readonly serviceCode?: string;

  constructor(
    reason: string,
    meta?: { statusCode?: number; requestId?: string; serviceCode?: string },
  ) {
    super(reason);
    this.name = "Privat24StatementSkipError";
    this.reason = reason;
    this.statusCode = meta?.statusCode;
    this.requestId = meta?.requestId;
    this.serviceCode = meta?.serviceCode;
  }
}

/** One balance item from GET /api/statements/balance (nameACC = найменування рахунку для реквізитів). */
export type Privat24BalanceItem = {
  acc: string;
  currency?: string;
  nameACC?: string;
  balanceIn?: string;
  balanceOut?: string;
  brnm?: string;
};

export type Privat24BalancesResult = {
  balances: Privat24BalanceItem[];
  next_page_id?: string;
};

/** Official Autoclient API: https://acp.privatbank.ua (docs: Опис API Автоклієнта 3.0) */
const DEFAULT_BASE_URL = "https://acp.privatbank.ua";
const TIMEOUT_MS = 30_000;
const RETRY_DELAYS_MS = [1000, 3000, 7000] as const;

/** Format date as DD-MM-YYYY for API query params (startDate, endDate), Kyiv calendar. */
function formatDateDDMMYYYY(d: Date): string {
  return DateTime.fromJSDate(d).setZone(CRM_TIME_ZONE).toFormat("dd-MM-yyyy");
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
    // DD.MM.YYYY HH:mm:ss or DD.MM.YYYY — bank wall time in Ukraine
    const dotMatch = s.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (dotMatch) {
      const [, d, m, y, h, min, sec] = dotMatch;
      const dt = DateTime.fromObject(
        {
          year: Number(y),
          month: Number(m),
          day: Number(d),
          hour: Number(h ?? 0),
          minute: Number(min ?? 0),
          second: Number(sec ?? 0),
        },
        { zone: CRM_TIME_ZONE },
      );
      if (dt.isValid) return dt.toJSDate();
    }
    // Plain YYYY-MM-DD → start of Kyiv day
    if (/^\d{4}-\d{2}-\d{2}$/.test(s) && !s.includes("T")) {
      const start = DateTime.fromISO(s, { zone: CRM_TIME_ZONE }).startOf("day");
      if (start.isValid && start.toISODate() === s) return start.toJSDate();
    }
    const iso = s.includes("T") ? s : s.includes(".") ? s.replace(/(\d{2})\.(\d{2})\.(\d{4})/, "$3-$2-$1") : `${s}T00:00:00.000Z`;
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) return parsed;
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

  async getSettings(
    credentials: Privat24Credentials,
    id?: string,
  ): Promise<Privat24SettingsResult> {
    const { withIdHeader } = this.resolveIdMode(credentials, id);
    const first = await this.callEndpointWithIdFallback(
      "/api/statements/settings",
      withIdHeader,
      credentials,
      undefined,
    );
    const data = JSON.parse(first.text || "{}") as Record<string, unknown>;
    const container =
      data.settings && typeof data.settings === "object"
        ? (data.settings as Record<string, unknown>)
        : data.data && typeof data.data === "object"
          ? (data.data as Record<string, unknown>)
          : data;
    if ((data.status as string) === "ERROR") {
      throw this.buildApiError(first.status, data, first.text);
    }
    return {
      phase: typeof container.phase === "string" ? container.phase : undefined,
      work_balance:
        typeof container.work_balance === "string"
          ? container.work_balance
          : undefined,
      today: typeof container.today === "string" ? container.today : undefined,
      lastday: typeof container.lastday === "string" ? container.lastday : undefined,
      date_final_statement:
        typeof container.date_final_statement === "string"
          ? container.date_final_statement
          : undefined,
      requestId:
        typeof data.requestId === "string"
          ? data.requestId
          : typeof data.request_id === "string"
            ? data.request_id
            : undefined,
      serviceCode:
        typeof data.serviceCode === "string"
          ? data.serviceCode
          : typeof data.service_code === "string"
            ? data.service_code
            : undefined,
    };
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
    const { withIdHeader } = this.resolveIdMode(credentials);
    const params = new URLSearchParams();
    params.set("acc", acc);
    params.set("startDate", startDate);
    params.set("endDate", endDate);
    params.set("limit", String(Privat24Client.LIMIT));
    if (cursor) params.set("followId", cursor);

    const settings = await this.getSettings(credentials);
    if (settings.phase && settings.phase.toUpperCase() !== "WRK") {
      throw new Privat24StatementSkipError("Privat24 settings phase is not WRK", {
        requestId: settings.requestId,
        serviceCode: settings.serviceCode,
      });
    }
    if (settings.work_balance && settings.work_balance.toUpperCase() === "Y") {
      throw new Privat24StatementSkipError("Privat24 settings work_balance=Y", {
        requestId: settings.requestId,
        serviceCode: settings.serviceCode,
      });
    }

    const request = await this.callEndpointWithIdFallback(
      "/api/statements/transactions",
      withIdHeader,
      credentials,
      params,
      true,
    );
    const data = JSON.parse(request.text || "{}") as Record<string, unknown>;

    if ((data.status as string) === "ERROR") {
      throw this.buildApiError(request.status, data, request.text);
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

    return { transactions, nextCursor };
  }

  /**
   * Fetch balances for all accounts (or pass acc to filter). Used to get nameACC for requisites.
   * GET /api/statements/balance?startDate=DD-MM-YYYY&endDate=DD-MM-YYYY&followId=...&limit=...
   */
  async getBalances(
    credentials: Privat24Credentials,
    from: Date,
    to: Date,
    cursor?: string,
  ): Promise<Privat24BalancesResult> {
    const startDate = formatDateDDMMYYYY(from);
    const endDate = formatDateDDMMYYYY(to);
    const { withIdHeader } = this.resolveIdMode(credentials);
    const params = new URLSearchParams();
    params.set("startDate", startDate);
    params.set("endDate", endDate);
    params.set("limit", String(Privat24Client.LIMIT));
    if (cursor) params.set("followId", cursor);

    const request = await this.callEndpointWithIdFallback(
      "/api/statements/balance",
      withIdHeader,
      credentials,
      params,
      true,
    );
    const data = JSON.parse(request.text || "{}") as Record<string, unknown>;
    if ((data.status as string) === "ERROR") {
      throw this.buildApiError(request.status, data, request.text);
    }

    const list = (data.balances as Privat24BalanceItem[]) ?? [];
    const next_page_id =
      data.exist_next_page && data.next_page_id != null ? String(data.next_page_id) : undefined;
    return { balances: list, next_page_id };
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

  private resolveIdMode(credentials: Privat24Credentials, explicitId?: string): {
    providedId: string;
    withIdHeader: boolean;
  } {
    const rawId = explicitId ?? credentials.id ?? credentials.clientId;
    const providedId =
      rawId != null && String(rawId).trim() !== "" ? String(rawId).trim() : "";
    return { providedId, withIdHeader: !!providedId };
  }

  private shouldRetryStatus(status: number): boolean {
    return status === 503 || status === 504;
  }

  private parseMetaFromText(text: string): { requestId?: string; serviceCode?: string } {
    try {
      const data = JSON.parse(text || "{}") as Record<string, unknown>;
      return {
        requestId:
          typeof data.requestId === "string"
            ? data.requestId
            : typeof data.request_id === "string"
              ? data.request_id
              : undefined,
        serviceCode:
          typeof data.serviceCode === "string"
            ? data.serviceCode
            : typeof data.service_code === "string"
              ? data.service_code
              : undefined,
      };
    } catch {
      return {};
    }
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async requestWithRetry(
    path: string,
    params: URLSearchParams,
    headers: Record<string, string>,
    retry503: boolean,
  ): Promise<{ res: Response; text: string }> {
    let attempt = 0;
    while (true) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(`${this.baseUrl}${path}?${params.toString()}`, {
          method: "GET",
          headers,
          signal: controller.signal,
        });
        const text = await res.text();
        if (
          retry503 &&
          this.shouldRetryStatus(res.status) &&
          attempt < RETRY_DELAYS_MS.length
        ) {
          const jitter = Math.floor(Math.random() * 300);
          await this.sleep(RETRY_DELAYS_MS[attempt] + jitter);
          attempt += 1;
          continue;
        }
        return { res, text };
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  private async callEndpointWithIdFallback(
    path: string,
    withIdHeader: boolean,
    credentials: Privat24Credentials,
    initialParams?: URLSearchParams,
    retry503 = false,
  ): Promise<{ status: number; text: string; requestId?: string; serviceCode?: string }> {
    const { providedId } = this.resolveIdMode(credentials);
    const params = new URLSearchParams(initialParams?.toString() ?? "");
    const buildHeaders = (sendHeaderId: boolean) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json;charset=utf-8",
        "User-Agent": "ECOCRM",
        token: credentials.token,
      };
      if (sendHeaderId && providedId) headers.id = providedId;
      return headers;
    };

    let sendHeaderId = withIdHeader;
    let useQueryId = false;
    while (true) {
      if (useQueryId && providedId) params.set("id", providedId);
      if (!useQueryId) params.delete("id");
      const { res, text } = await this.requestWithRetry(
        path,
        params,
        buildHeaders(sendHeaderId),
        retry503,
      );
      const meta = this.parseMetaFromText(text);

      if (
        !res.ok &&
        res.status === 400 &&
        /id in mode for companies should not be present/i.test(text) &&
        sendHeaderId
      ) {
        sendHeaderId = false;
        useQueryId = false;
        continue;
      }

      if (
        !res.ok &&
        res.status === 400 &&
        /id is not be null/i.test(text) &&
        !sendHeaderId &&
        providedId &&
        !useQueryId
      ) {
        sendHeaderId = true;
        continue;
      }

      if (
        !res.ok &&
        res.status === 400 &&
        /id/i.test(text) &&
        providedId &&
        sendHeaderId &&
        !useQueryId
      ) {
        sendHeaderId = false;
        useQueryId = true;
        continue;
      }

      if (
        !res.ok &&
        res.status === 400 &&
        /id is not be null/i.test(text) &&
        !providedId
      ) {
        throw new Error(
          "Приват24 працює в режимі групи ПП. Вкажіть ID для цього ФОП у налаштуваннях рахунку.",
        );
      }

      if (!res.ok) {
        const details = [`Privat24 API HTTP ${res.status}`];
        if (meta.requestId) details.push(`requestId=${meta.requestId}`);
        if (meta.serviceCode) details.push(`serviceCode=${meta.serviceCode}`);
        throw new Error(`${details.join(" ")}. ${text.slice(0, 500)}`);
      }

      return {
        status: res.status,
        text,
        requestId: meta.requestId,
        serviceCode: meta.serviceCode,
      };
    }
  }

  private buildApiError(
    statusCode: number,
    data: Record<string, unknown>,
    rawText: string,
  ): Error {
    const requestId =
      typeof data.requestId === "string"
        ? data.requestId
        : typeof data.request_id === "string"
          ? data.request_id
          : undefined;
    const serviceCode =
      typeof data.serviceCode === "string"
        ? data.serviceCode
        : typeof data.service_code === "string"
          ? data.service_code
          : undefined;
    const details = [`Privat24 API error status=${statusCode}`];
    if (requestId) details.push(`requestId=${requestId}`);
    if (serviceCode) details.push(`serviceCode=${serviceCode}`);
    const message =
      (data.message as string) ||
      (data.code as string) ||
      rawText.slice(0, 500) ||
      "Privat24 API error";
    return new Error(`${details.join(" ")}. ${message}`);
  }
}
