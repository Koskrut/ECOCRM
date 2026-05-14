// src/np/np-client.service.ts
import { BadRequestException, Injectable } from "@nestjs/common";
import { SettingsService } from "../settings/settings.service";

export type NpResponse<T> = {
  success: boolean;
  data: T[];
  errors?: string[];
  warnings?: string[];
  info?: unknown[];
  messageCodes?: string[];
  errorCodes?: string[];
  warningCodes?: string[];
  infoCodes?: string[];
};

@Injectable()
export class NpClient {
  constructor(private readonly settings: SettingsService) {}

  async call<T = unknown>(
    modelName: string,
    calledMethod: string,
    methodProperties: Record<string, unknown> = {},
  ): Promise<NpResponse<T>> {
    const { apiKey, apiUrl, timeoutMs } = await this.settings.resolveNovaPoshtaApiCallParams();
    if (typeof fetch !== "function") {
      throw new Error(
        "Global fetch is not available. Use Node 18+ OR install undici and use the undici version of NpClient.",
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          apiKey,
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

        throw new BadRequestException(
          `NP API error (model=${modelName}.${calledMethod}): ${msg}`,
        );
      }

      return json as NpResponse<T>;
    } catch (e: unknown) {
      if ((e as { name?: string })?.name === "AbortError") {
        throw new Error(
          `Nova Poshta API timeout after ${timeoutMs}ms (model=${modelName}.${calledMethod})`,
        );
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }
}
