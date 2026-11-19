import { metaGraphApiVersion, sanitizeMetaError, sha256Hex } from "./meta-audience.normalize";
import { META_AUDIENCE_BATCH } from "./meta-audience.types";
import type { NormalizedPerson } from "./meta-audience.types";

const SCHEMA = ["PHONE", "EMAIL", "FN", "LN", "COUNTRY"] as const;
const VALUE_SCHEMA = [...SCHEMA, "LOOKALIKE_VALUE"] as const;

export type MetaAudienceGraph = {
  createAudience(input: {
    adAccountId: string;
    accessToken: string;
    version: string;
    name: string;
    description: string;
    valueBased: boolean;
  }): Promise<string>;
  replaceUsers(input: {
    audienceId: string;
    accessToken: string;
    version: string;
    people: NormalizedPerson[];
    valueBased: boolean;
  }): Promise<number>;
};

function graphErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error?: { message?: string; code?: number } }).error;
    const message = typeof error?.message === "string" && error.message.trim() ? error.message.trim() : "Помилка Meta";
    return error?.code != null ? `Meta ${error.code}: ${message}` : message;
  }
  return `Meta HTTP ${status}`;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function metaAudienceRow(person: NormalizedPerson, valueBased: boolean): (string | number)[] {
  const row: (string | number)[] = [
    person.phone ? sha256Hex(person.phone) : "",
    person.email ? sha256Hex(person.email) : "",
    person.firstName ? sha256Hex(person.firstName) : "",
    person.lastName ? sha256Hex(person.lastName) : "",
    sha256Hex("ua"),
  ];
  if (valueBased) row.push(person.value != null ? person.value : "");
  return row;
}

export function createMetaAudienceGraph(fetchImpl: typeof fetch = fetch): MetaAudienceGraph {
  async function postForm(url: string, token: string, fields: Record<string, string>): Promise<unknown> {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) body.set(key, value);
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Помилка мережі";
      throw new Error(sanitizeMetaError(message, token));
    }
    const parsed = await readJson(response);
    if (!response.ok) {
      throw new Error(sanitizeMetaError(graphErrorMessage(parsed, response.status), token));
    }
    return parsed;
  }

  return {
    async createAudience(input) {
      const account = input.adAccountId.replace(/\D/g, "");
      const version = input.version || metaGraphApiVersion();
      const url = `https://graph.facebook.com/${version}/act_${account}/customaudiences`;
      const fields: Record<string, string> = {
        name: input.name,
        subtype: "CUSTOM",
        description: input.description,
        customer_file_source: "USER_PROVIDED_ONLY",
      };
      if (input.valueBased) fields.is_value_based = "1";
      const parsed = (await postForm(url, input.accessToken, fields)) as { id?: string } | null;
      if (!parsed?.id) throw new Error(sanitizeMetaError("Meta не повернула ідентифікатор аудиторії", input.accessToken));
      return String(parsed.id);
    },

    async replaceUsers(input) {
      if (input.people.length === 0) {
        throw new Error("Порожній список не замінюють");
      }
      const version = input.version || metaGraphApiVersion();
      const url = `https://graph.facebook.com/${version}/${encodeURIComponent(input.audienceId)}/usersreplace`;
      const schema = input.valueBased ? VALUE_SCHEMA : SCHEMA;
      const sessionId = Date.now() + Math.floor(Math.random() * 1000);
      let received = 0;
      const total = input.people.length;
      const batches = Math.ceil(total / META_AUDIENCE_BATCH);
      for (let index = 0; index < batches; index += 1) {
        const slice = input.people.slice(index * META_AUDIENCE_BATCH, (index + 1) * META_AUDIENCE_BATCH);
        const payload = {
          schema,
          data: slice.map((person) => metaAudienceRow(person, input.valueBased)),
        };
        const session = {
          session_id: sessionId,
          batch_seq: index + 1,
          last_batch_flag: index === batches - 1,
          estimated_num_total: total,
        };
        const parsed = (await postForm(url, input.accessToken, {
          payload: JSON.stringify(payload),
          session: JSON.stringify(session),
        })) as { num_received?: number } | null;
        const count = Number(parsed?.num_received ?? 0);
        received += Number.isFinite(count) ? count : 0;
      }
      return received;
    },
  };
}
