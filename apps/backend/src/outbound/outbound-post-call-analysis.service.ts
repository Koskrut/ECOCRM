import { Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import { SettingsService } from "../settings/settings.service";
import type { ScenarioDefinition } from "./scenarios/scenario.types";
import { ScenarioRegistryService } from "./scenarios/scenario-registry.service";

const FALLBACK_OUTCOME = "NO_ANSWER";

/** Strict shape after parse (mirrors OpenAI json_schema contract). */
export type OutboundPostCallAiResult = {
  outcomeKey: string;
  summary: string;
  fields: Record<string, unknown>;
  /** True when NO_ANSWER / errors / missing key path — for QA needsReview. */
  usedFallbackOutcome: boolean;
  /** Only set when parsed from json_schema response and numeric 0..1; else null. */
  aiConfidence: number | null;
};

@Injectable()
export class OutboundPostCallAnalysisService {
  private readonly logger = new Logger(OutboundPostCallAnalysisService.name);

  constructor(
    private readonly settings: SettingsService,
    private readonly scenarios: ScenarioRegistryService,
  ) {}

  /**
   * transcript -> LLM JSON -> validate outcomeKey against scenario; safe fallback NO_ANSWER.
   * When fixedOutcomeKey is set and maps to a valid outcome, the model must echo that key (summary-only fill).
   */
  async analyzeFromTranscript(params: {
    scenario: ScenarioDefinition;
    transcript: string;
    fixedOutcomeKey?: string;
  }): Promise<OutboundPostCallAiResult> {
    const { scenario, transcript, fixedOutcomeKey } = params;
    const allowedKeys = this.scenarios.listValidOutcomeKeys(scenario);
    const allowedList = allowedKeys.join(", ");

    const fixed =
      fixedOutcomeKey?.trim() && this.scenarios.findOutcomeMapping(scenario, fixedOutcomeKey.trim())
        ? fixedOutcomeKey.trim()
        : undefined;

    const ai = await this.settings.getTelegramAiConfig();
    if (!ai.openaiApiKey) {
      this.logger.warn("Post-call AI skipped: no OpenAI API key (Telegram AI settings or OPENAI_API_KEY)");
      return {
        outcomeKey: FALLBACK_OUTCOME,
        summary: "Немає API ключа для AI (налаштування Telegram AI / OPENAI_API_KEY).",
        fields: {},
        usedFallbackOutcome: true,
        aiConfidence: null,
      };
    }

    const client = new OpenAI({ apiKey: ai.openaiApiKey });

    const system = fixed
      ? `You summarize outbound sales calls. Reply ONLY with a JSON object with keys: outcomeKey (string), summary (string, Ukrainian), fields (object with string values where possible).
outcomeKey MUST be exactly "${fixed}" (pre-validated). Do not use any other value.
Use transcript only; do not invent CRM facts.`
      : `You classify outbound sales calls. Reply ONLY with a JSON object with keys: outcomeKey (string), summary (string, Ukrainian), fields (object with string values where possible).
outcomeKey MUST be exactly one of: ${allowedList}
Use transcript only; do not invent CRM facts.`;

    const user = `Scenario: ${scenario.code}@${scenario.version} (${scenario.nameUk})
Transcript:
${transcript.slice(0, 24_000)}`;

    const jsonSchema = {
      name: "outbound_post_call_result",
      strict: true,
      schema: {
        type: "object",
        properties: {
          outcomeKey: { type: "string" },
          summary: { type: "string" },
          fields: {
            type: "object",
            additionalProperties: true,
          },
        },
        required: ["outcomeKey", "summary", "fields"],
        additionalProperties: false,
      },
    } as const;

    let raw: string | undefined;
    let jsonSchemaSuccess = false;
    try {
      const completion = await client.chat.completions.create({
        model: ai.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: 800,
        temperature: 0.2,
        response_format: {
          type: "json_schema",
          json_schema: jsonSchema,
        },
      });
      raw = completion.choices[0]?.message?.content?.trim();
      jsonSchemaSuccess = true;
    } catch (e) {
      this.logger.warn(
        `Post-call AI json_schema failed, trying json_object: ${e instanceof Error ? e.message : String(e)}`,
      );
      try {
        const completion = await client.chat.completions.create({
          model: ai.model,
          messages: [
            { role: "system", content: system + " Output valid JSON only, no markdown." },
            { role: "user", content: user },
          ],
          max_tokens: 800,
          temperature: 0.2,
          response_format: { type: "json_object" },
        });
        raw = completion.choices[0]?.message?.content?.trim();
      } catch (e2) {
        this.logger.error(`Post-call AI failed: ${e2 instanceof Error ? e2.message : String(e2)}`);
        return {
          outcomeKey: FALLBACK_OUTCOME,
          summary: "Не вдалося виконати AI-аналіз дзвінка.",
          fields: {},
          usedFallbackOutcome: true,
          aiConfidence: null,
        };
      }
    }

    const parsed = this.parseAndValidate(raw, scenario, allowedKeys, fixed, jsonSchemaSuccess);
    return parsed;
  }

  private parseAndValidate(
    raw: string | undefined,
    scenario: ScenarioDefinition,
    allowedKeys: string[],
    fixedOutcomeKey: string | undefined,
    jsonSchemaSuccess: boolean,
  ): OutboundPostCallAiResult {
    if (!raw) {
      return {
        outcomeKey: FALLBACK_OUTCOME,
        summary: "Порожня відповідь моделі.",
        fields: {},
        usedFallbackOutcome: true,
        aiConfidence: null,
      };
    }

    let obj: unknown;
    try {
      obj = JSON.parse(raw);
    } catch {
      this.logger.warn("Post-call AI: invalid JSON");
      return {
        outcomeKey: FALLBACK_OUTCOME,
        summary: "Некоректна JSON-відповідь моделі.",
        fields: {},
        usedFallbackOutcome: true,
        aiConfidence: null,
      };
    }

    if (!obj || typeof obj !== "object") {
      return {
        outcomeKey: FALLBACK_OUTCOME,
        summary: "Відповідь моделі не є об'єктом.",
        fields: {},
        usedFallbackOutcome: true,
        aiConfidence: null,
      };
    }

    const rec = obj as Record<string, unknown>;
    let outcomeKey = typeof rec.outcomeKey === "string" ? rec.outcomeKey.trim() : "";
    const summary = typeof rec.summary === "string" ? rec.summary.trim() : "";
    const fieldsRaw = rec.fields;
    const fields: Record<string, unknown> =
      fieldsRaw && typeof fieldsRaw === "object" && !Array.isArray(fieldsRaw)
        ? { ...(fieldsRaw as Record<string, unknown>) }
        : {};

    let aiConfidence: number | null = null;
    if (jsonSchemaSuccess) {
      const c = rec.confidence;
      if (typeof c === "number" && Number.isFinite(c) && c >= 0 && c <= 1) {
        aiConfidence = c;
      }
    }

    if (fixedOutcomeKey && outcomeKey !== fixedOutcomeKey) {
      this.logger.warn(
        `Post-call AI: model outcomeKey "${outcomeKey}" !== fixed "${fixedOutcomeKey}"; coercing`,
      );
      outcomeKey = fixedOutcomeKey;
    }

    if (!outcomeKey || !this.scenarios.findOutcomeMapping(scenario, outcomeKey)) {
      this.logger.warn(
        `Post-call AI: invalid outcomeKey "${outcomeKey}" for ${scenario.code}; fallback ${FALLBACK_OUTCOME}`,
      );
      return {
        outcomeKey: FALLBACK_OUTCOME,
        summary: summary || `Невідомий outcomeKey від моделі: ${outcomeKey || "(empty)"}`,
        fields,
        usedFallbackOutcome: true,
        aiConfidence: null,
      };
    }

    return {
      outcomeKey,
      summary: summary || `Outcome: ${outcomeKey}`,
      fields,
      usedFallbackOutcome: false,
      aiConfidence,
    };
  }
}
