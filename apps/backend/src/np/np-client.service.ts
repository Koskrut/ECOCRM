// src/np/np-client.service.ts
import { Injectable } from "@nestjs/common";

export type NpResponse<T> = {
  success: boolean;
  data: T[];
  errors?: string[];
  warnings?: string[];
  info?: any[]; // ✅ сделаем универсально
  messageCodes?: string[];
  errorCodes?: string[];
  warningCodes?: string[];
  infoCodes?: string[];
};

@Injectable()
export class NpClient {
  private readonly url = process.env.NP_API_URL || "https://api.novaposhta.ua/v2.0/json/";
  private readonly apiKey = process.env.NP_API_KEY || "";
  private readonly timeoutMs = Number(process.env.NP_API_TIMEOUT_MS || 20000);

  async call<T = any>(
    modelName: string,
    calledMethod: string,
    methodProperties: Record<string, any> = {},
  ): Promise<NpResponse<T>> {
    if (!this.apiKey) throw new Error("NP_API_KEY is not set");
    if (typeof fetch !== "function") {
      throw new Error(
        "Global fetch is not available. Use Node 18+ OR install undici and use the undici version of NpClient.",
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          apiKey: this.apiKey,
          modelName,
          calledMethod,
          methodProperties,
        }),
      });

      const text = await res.text();
      const json = JSON.parse(text);

      if (!res.ok) {
        throw new Error(
          `Nova Poshta API HTTP ${res.status} (model=${modelName}.${calledMethod}). Body: ${JSON.stringify(json).slice(0, 800)}`,
        );
      }

      if (!json?.success) {
        const msg =
          json?.errors?.join("; ") ||
          json?.warnings?.join("; ") ||
          (Array.isArray(json?.info) ? json.info.join("; ") : "") ||
          "Nova Poshta API error";

        throw new Error(
          `NP API error (model=${modelName}.${calledMethod}): ${msg}. Response: ${JSON.stringify(json).slice(0, 800)}`,
        );
      }

      return json as NpResponse<T>;
    } catch (e: any) {
      if (e?.name === "AbortError") {
        throw new Error(`Nova Poshta API timeout after ${this.timeoutMs}ms (model=${modelName}.${calledMethod})`);
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }
}
