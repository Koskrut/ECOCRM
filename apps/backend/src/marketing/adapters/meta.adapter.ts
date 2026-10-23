import type { CabinetSecrets, HashedPerson, OutcomeEvent, RemoteInsight } from "./types";
import { CabinetAuthError, readJson } from "./types";

const GRAPH = "https://graph.facebook.com/v21.0";

function mapStatus(value: string | undefined): RemoteInsight["deliveryStatus"] {
  const status = (value ?? "").toUpperCase();
  if (status === "ACTIVE") return "ACTIVE";
  if (status === "PAUSED" || status === "CAMPAIGN_PAUSED" || status === "ADSET_PAUSED") return "PAUSED";
  if (status === "ARCHIVED" || status === "DELETED" || status === "COMPLETED") return "COMPLETED";
  return "UNKNOWN";
}

async function graphGet(path: string, token: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`${GRAPH}/${path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", token);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const body = await readJson(response);
  if (response.status === 401 || response.status === 403) throw new CabinetAuthError();
  const error = (body as { error?: { code?: number } } | null)?.error;
  if (error?.code === 190 || error?.code === 102) throw new CabinetAuthError();
  if (!response.ok) {
    throw new Error("Не вдалося оновити дані кабінету Meta");
  }
  return body;
}

export async function pullMetaInsights(secrets: CabinetSecrets, since: string, until: string): Promise<RemoteInsight[]> {
  if (!secrets.accessToken) throw new CabinetAuthError();
  const account = secrets.externalAccountId.replace(/^act_/, "");
  const rows: RemoteInsight[] = [];
  let next: string | null = null;
  let page = 0;
  type InsightPage = { data?: Array<Record<string, string>>; paging?: { next?: string } } | null;
  do {
    const body: InsightPage = next
      ? await (async (): Promise<InsightPage> => {
          const response = await fetch(next as string, { signal: AbortSignal.timeout(20_000) });
          const parsed = await readJson(response);
          if (!response.ok) throw new Error("Не вдалося оновити дані кабінету Meta");
          return parsed as InsightPage;
        })()
      : ((await graphGet(`act_${account}/insights`, secrets.accessToken, {
          level: "ad",
          time_increment: "1",
          fields:
            "spend,impressions,clicks,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,account_currency,date_start",
          time_range: JSON.stringify({ since, until }),
          limit: "500",
        })) as InsightPage);
    const data = body?.data ?? [];
    for (const row of data) {
      if (!row.ad_id) continue;
      rows.push({
        campaignExternalId: row.campaign_id || "",
        adSetExternalId: row.adset_id || "",
        adExternalId: row.ad_id,
        campaignName: row.campaign_name || null,
        adSetName: row.adset_name || null,
        adName: row.ad_name || null,
        deliveryStatus: "UNKNOWN",
        date: row.date_start,
        spend: Number(row.spend ?? 0),
        impressions: Number(row.impressions ?? 0),
        clicks: Number(row.clicks ?? 0),
        currency: row.account_currency || secrets.currency,
      });
    }
    next = body?.paging?.next ?? null;
    page += 1;
  } while (next && page < 20);

  const ads = await graphGet(`act_${account}/ads`, secrets.accessToken, {
    fields: "id,effective_status",
    limit: "500",
  });
  const statusByAd = new Map<string, RemoteInsight["deliveryStatus"]>();
  for (const ad of (ads as { data?: Array<{ id?: string; effective_status?: string }> } | null)?.data ?? []) {
    if (ad.id) statusByAd.set(ad.id, mapStatus(ad.effective_status));
  }
  return rows.map((row) => ({
    ...row,
    deliveryStatus: statusByAd.get(row.adExternalId) ?? row.deliveryStatus,
  }));
}

function eventName(kind: OutcomeEvent["kind"]): string {
  if (kind === "PURCHASE") return "Purchase";
  if (kind === "JUNK") return "CRMJunk";
  if (kind === "QUALITY") return "CRMQuality";
  return "Lead";
}

export async function sendMetaOutcome(secrets: CabinetSecrets, event: OutcomeEvent): Promise<string> {
  if (!secrets.accessToken || !secrets.pixelId) throw new CabinetAuthError();
  const userData: Record<string, unknown> = {};
  if (event.person.phoneHash) userData.ph = [event.person.phoneHash];
  if (event.person.emailHash) userData.em = [event.person.emailHash];
  if (event.person.firstNameHash) userData.fn = [event.person.firstNameHash];
  if (event.person.lastNameHash) userData.ln = [event.person.lastNameHash];
  if (event.person.cityHash) userData.ct = [event.person.cityHash];
  if (event.clickId) userData.fbc = `fb.1.${event.eventTime.getTime()}.${event.clickId}`;
  const payload: Record<string, unknown> = {
    event_name: eventName(event.kind),
    event_time: Math.floor(event.eventTime.getTime() / 1000),
    event_id: event.eventId,
    action_source: event.clickId ? "website" : "system_generated",
    user_data: userData,
  };
  if (event.kind === "PURCHASE" && event.valueAmount != null) {
    payload.custom_data = { value: event.valueAmount, currency: event.valueCurrency ?? secrets.currency };
  }
  const url = new URL(`${GRAPH}/${encodeURIComponent(secrets.pixelId)}/events`);
  url.searchParams.set("access_token", secrets.accessToken);
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: [payload] }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await readJson(response);
  if (response.status === 401 || response.status === 403) throw new CabinetAuthError();
  if (!response.ok) throw new Error("Не вдалося передати результат у Meta");
  const events = (body as { events_received?: number } | null)?.events_received;
  return events != null ? `${secrets.pixelId}:${event.eventId}` : event.eventId;
}

export async function createMetaAudience(secrets: CabinetSecrets, name: string): Promise<string> {
  if (!secrets.accessToken) throw new CabinetAuthError();
  const account = secrets.externalAccountId.replace(/^act_/, "");
  const url = new URL(`${GRAPH}/act_${account}/customaudiences`);
  url.searchParams.set("access_token", secrets.accessToken);
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      subtype: "CUSTOM",
      customer_file_source: "USER_PROVIDED_ONLY",
      description: name,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await readJson(response)) as { id?: string; error?: { code?: number } } | null;
  if (body?.error?.code === 190) throw new CabinetAuthError();
  if (!response.ok || !body?.id) throw new Error("Не вдалося створити список у Meta");
  return body.id;
}

export async function uploadMetaAudience(secrets: CabinetSecrets, audienceId: string, people: HashedPerson[]): Promise<void> {
  if (!secrets.accessToken) throw new CabinetAuthError();
  const schema = ["EMAIL", "PHONE", "FN", "LN", "CT"];
  const data = people.map((person) => [
    person.emailHash ?? "",
    person.phoneHash ?? "",
    person.firstNameHash ?? "",
    person.lastNameHash ?? "",
    person.cityHash ?? "",
  ]);
  for (let offset = 0; offset < data.length; offset += 5000) {
    const url = new URL(`${GRAPH}/${encodeURIComponent(audienceId)}/users`);
    url.searchParams.set("access_token", secrets.accessToken);
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: { schema, data: data.slice(offset, offset + 5000) } }),
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 401 || response.status === 403) throw new CabinetAuthError();
    if (!response.ok) throw new Error("Не вдалося оновити список у Meta");
  }
}

export async function deleteMetaAudience(secrets: CabinetSecrets, audienceId: string): Promise<void> {
  if (!secrets.accessToken) return;
  const url = new URL(`${GRAPH}/${encodeURIComponent(audienceId)}`);
  url.searchParams.set("access_token", secrets.accessToken);
  await fetch(url, { method: "DELETE", signal: AbortSignal.timeout(20_000) }).catch(() => undefined);
}

export async function createMetaLookalike(secrets: CabinetSecrets, originId: string, name: string): Promise<string> {
  if (!secrets.accessToken) throw new CabinetAuthError();
  const account = secrets.externalAccountId.replace(/^act_/, "");
  const url = new URL(`${GRAPH}/act_${account}/customaudiences`);
  url.searchParams.set("access_token", secrets.accessToken);
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      subtype: "LOOKALIKE",
      origin_audience_id: originId,
      lookalike_spec: JSON.stringify({ type: "similarity", country: "UA", ratio: 0.01 }),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await readJson(response)) as { id?: string } | null;
  if (!response.ok || !body?.id) throw new Error("Не вдалося створити схожих клієнтів у Meta");
  return body.id;
}

export function metaCampaignUrl(accountId: string, campaignId: string): string {
  const act = accountId.replace(/^act_/, "");
  return `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent(act)}&selected_campaign_ids=${encodeURIComponent(campaignId)}`;
}
