import { Injectable } from "@nestjs/common";

export type UpcHttpOptions = {
  method?: string;
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
  accessToken?: string;
};

@Injectable()
export class UpcHttpClient {
  private baseUrl(): string {
    return (process.env.UPC_API_BASE_URL ?? "https://portal.preprod.api.upc.ua").replace(/\/+$/, "");
  }

  isMockMode(): boolean {
    return process.env.UPC_API_MOCK === "true";
  }

  async request<T>(opts: UpcHttpOptions): Promise<T> {
    if (this.isMockMode()) {
      throw new Error("UPC_API_MOCK: use fixture clients in mock mode");
    }

    const url = `${this.baseUrl()}${opts.path.startsWith("/") ? opts.path : `/${opts.path}`}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(opts.body !== undefined && { "Content-Type": "application/json" }),
      ...opts.headers,
    };
    if (opts.accessToken) {
      headers.Authorization = `Bearer ${opts.accessToken}`;
    }

    const res = await fetch(url, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`UPC API ${res.status}: ${text.slice(0, 500)}`);
    }
    if (!text.trim()) return {} as T;
    return JSON.parse(text) as T;
  }
}
