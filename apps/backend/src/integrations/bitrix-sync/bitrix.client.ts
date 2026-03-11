import { Logger } from "@nestjs/common";

const PAGE_SIZE = 50;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

export type BitrixFilter = Record<string, unknown>;

export class BitrixClient {
  private readonly logger = new Logger(BitrixClient.name);
  private readonly baseUrl: string;

  constructor(webhookUrl?: string) {
    const url = webhookUrl ?? process.env.BITRIX_WEBHOOK_URL ?? "";
    this.baseUrl = url.replace(/\/$/, "");
    if (!this.baseUrl) {
      this.logger.warn("BITRIX_WEBHOOK_URL not set; Bitrix REST calls will fail");
    }
  }

  private async request<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const url = `${this.baseUrl}/${method}`;
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });
        const status = res.status;
        if (status === 429 || (status >= 500 && status < 600)) {
          if (attempt < MAX_RETRIES) {
            this.logger.warn(`Bitrix ${method} status ${status}, retry ${attempt}/${MAX_RETRIES} in ${RETRY_DELAY_MS}ms`);
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
            continue;
          }
        }
        if (!res.ok) {
          const text = await res.text();
          if (status === 401 && text.includes("insufficient_scope")) {
            throw new Error(
              `Bitrix ${method} HTTP 401: insufficient_scope. Create a new incoming webhook in Bitrix24 with CRM (companies, leads, deals, contacts) read permissions and set BITRIX_WEBHOOK_URL to that URL.`,
            );
          }
          throw new Error(`Bitrix ${method} HTTP ${status}: ${text}`);
        }
        const data = (await res.json()) as { result?: T; error?: string; error_description?: string };
        if (data.error) {
          throw new Error(data.error_description ?? data.error);
        }
        return (data.result ?? data) as T;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        }
      }
    }
    throw lastError ?? new Error(`Bitrix ${method} failed after ${MAX_RETRIES} retries`);
  }

  /**
   * Fetch all pages for a list method with optional filter.
   * Stops when result length < PAGE_SIZE or maxPages is reached.
   */
  async list(
    method: "crm.contact.list" | "crm.company.list" | "crm.deal.list" | "crm.lead.list",
    filter: BitrixFilter,
    maxPages: number,
  ): Promise<Record<string, unknown>[]> {
    const all: Record<string, unknown>[] = [];
    let start = 0;
    let page = 0;
    while (page < maxPages) {
      const result = await this.request<Record<string, unknown>[] | Record<string, unknown>>(method, {
        filter,
        start,
        order: { DATE_MODIFY: "ASC" },
      });
      const items = Array.isArray(result)
        ? result
        : typeof result === "object" && result !== null
          ? (Object.values(result) as Record<string, unknown>[])
          : [];
      for (const item of items) {
        all.push(item);
      }
      if (items.length < PAGE_SIZE) break;
      start += PAGE_SIZE;
      page++;
    }
    return all;
  }

  /** Bitrix REST expects filter key with operator prefix, e.g. ">DATE_MODIFY": "2024-01-01T00:00:00Z" */
  private dateModifyFilter(date: Date): BitrixFilter {
    return { ">DATE_MODIFY": date.toISOString().replace(/\.\d{3}Z$/, "Z") };
  }

  async getContactsModifiedAfter(date: Date, maxPages: number): Promise<Record<string, unknown>[]> {
    return this.list("crm.contact.list", this.dateModifyFilter(date), maxPages);
  }

  async getCompaniesModifiedAfter(date: Date, maxPages: number): Promise<Record<string, unknown>[]> {
    return this.list("crm.company.list", this.dateModifyFilter(date), maxPages);
  }

  async getDealsModifiedAfter(date: Date, maxPages: number): Promise<Record<string, unknown>[]> {
    return this.list("crm.deal.list", this.dateModifyFilter(date), maxPages);
  }

  async getLeadsModifiedAfter(date: Date, maxPages: number): Promise<Record<string, unknown>[]> {
    return this.list("crm.lead.list", this.dateModifyFilter(date), maxPages);
  }

  /** Fetch single entity by ID (for webhook processing). */
  async getById(
    method: "crm.contact.get" | "crm.company.get" | "crm.lead.get" | "crm.deal.get",
    id: number,
  ): Promise<Record<string, unknown> | null> {
    try {
      const result = await this.request<Record<string, unknown>>(method, { id });
      return result && typeof result === "object" ? result : null;
    } catch {
      return null;
    }
  }
}
