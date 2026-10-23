import { createHash } from "node:crypto";
import type { CabinetSecrets, HashedPerson, OutcomeEvent, RemoteInsight } from "./types";
import { CabinetAuthError, readJson } from "./types";

const API = "https://business-api.tiktok.com/open_api/v1.3";

function authHeaders(token: string, json = true): Headers {
  const headers = new Headers();
  headers.set("Access-Token", token);
  if (json) headers.set("content-type", "application/json");
  return headers;
}

function mapStatus(value: string | undefined): RemoteInsight["deliveryStatus"] {
  const status = (value ?? "").toUpperCase();
  if (status === "ENABLE" || status === "ENABLED" || status === "ACTIVE") return "ACTIVE";
  if (status === "DISABLE" || status === "PAUSED" || status === "DISABLE_BY_QUOTA") return "PAUSED";
  if (status === "DELETE" || status === "DELETED" || status === "COMPLETED") return "COMPLETED";
  return "UNKNOWN";
}

function buildAudienceCsv(people: HashedPerson[]): Buffer {
  const lines = ["email_SHA256,phone_SHA256"];
  for (const person of people.slice(0, 5000)) {
    if (!person.emailHash && !person.phoneHash) continue;
    lines.push(`${person.emailHash ?? ""},${person.phoneHash ?? ""}`);
  }
  return Buffer.from(`${lines.join("\n")}\n`, "utf8");
}

export async function pullTikTokInsights(secrets: CabinetSecrets, since: string, until: string): Promise<RemoteInsight[]> {
  if (!secrets.accessToken) throw new CabinetAuthError();
  const url = new URL(`${API}/report/integrated/get/`);
  url.searchParams.set("advertiser_id", secrets.externalAccountId);
  url.searchParams.set("report_type", "BASIC");
  url.searchParams.set("data_level", "AUCTION_AD");
  url.searchParams.set("dimensions", JSON.stringify(["ad_id", "stat_time_day"]));
  url.searchParams.set("metrics", JSON.stringify(["spend", "impressions", "clicks", "campaign_id", "campaign_name", "adgroup_id", "adgroup_name", "ad_name"]));
  url.searchParams.set("start_date", since);
  url.searchParams.set("end_date", until);
  url.searchParams.set("page_size", "1000");
  const response = await fetch(url, { headers: authHeaders(secrets.accessToken), signal: AbortSignal.timeout(30_000) });
  if (response.status === 401 || response.status === 403) throw new CabinetAuthError();
  const body = (await readJson(response)) as {
    code?: number;
    data?: { list?: Array<{ dimensions?: Record<string, string>; metrics?: Record<string, string> }> };
  } | null;
  if (body?.code === 40100 || body?.code === 40001) throw new CabinetAuthError();
  if (!response.ok || (body?.code != null && body.code !== 0)) {
    throw new Error("Не вдалося оновити дані кабінету TikTok");
  }
  const rows: RemoteInsight[] = [];
  for (const item of body?.data?.list ?? []) {
    const dimensions = item.dimensions ?? {};
    const metrics = item.metrics ?? {};
    const adId = dimensions.ad_id;
    const day = (dimensions.stat_time_day ?? "").slice(0, 10);
    if (!adId || !day) continue;
    rows.push({
      campaignExternalId: metrics.campaign_id || "",
      adSetExternalId: metrics.adgroup_id || "",
      adExternalId: adId,
      campaignName: metrics.campaign_name || null,
      adSetName: metrics.adgroup_name || null,
      adName: metrics.ad_name || null,
      deliveryStatus: mapStatus(metrics.ad_status),
      date: day,
      spend: Number(metrics.spend ?? 0),
      impressions: Number(metrics.impressions ?? 0),
      clicks: Number(metrics.clicks ?? 0),
      currency: secrets.currency,
    });
  }
  return rows;
}

export async function sendTikTokOutcome(secrets: CabinetSecrets, event: OutcomeEvent): Promise<string> {
  if (!secrets.accessToken || !secrets.pixelId) throw new CabinetAuthError();
  const eventName =
    event.kind === "PURCHASE"
      ? "CompletePayment"
      : event.kind === "LEAD"
        ? "SubmitForm"
        : event.kind === "QUALITY"
          ? "CompleteRegistration"
          : "CRMJunk";
  const response = await fetch(`${API}/event/track/`, {
    method: "POST",
    headers: authHeaders(secrets.accessToken),
    body: JSON.stringify({
      event_source: "web",
      event_source_id: secrets.pixelId,
      data: [
        {
          event: eventName,
          event_time: Math.floor(event.eventTime.getTime() / 1000),
          event_id: event.eventId,
          user: {
            email: event.person.emailHash ? [event.person.emailHash] : undefined,
            phone: event.person.phoneHash ? [event.person.phoneHash] : undefined,
            ttclid: event.clickId ?? undefined,
          },
          properties:
            event.kind === "PURCHASE" && event.valueAmount != null
              ? { currency: event.valueCurrency ?? secrets.currency, value: event.valueAmount }
              : undefined,
        },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await readJson(response)) as { code?: number } | null;
  if (response.status === 401 || body?.code === 40100) throw new CabinetAuthError();
  if (!response.ok || (body?.code != null && body.code !== 0)) {
    throw new Error("Не вдалося передати результат у TikTok");
  }
  return event.eventId;
}

/**
 * TikTok expects: upload a .csv/.txt via multipart, then create the audience with the returned file_path.
 * JSON body to file/upload is rejected.
 */
export async function uploadTikTokAudience(secrets: CabinetSecrets, name: string, people: HashedPerson[]): Promise<string> {
  if (!secrets.accessToken) throw new CabinetAuthError();
  const file = buildAudienceCsv(people);
  const fileSignature = createHash("md5").update(file).digest("hex");
  const form = new FormData();
  form.set("advertiser_id", secrets.externalAccountId);
  form.set("calculate_type", "MULTIPLE_TYPES");
  form.set("file_signature", fileSignature);
  form.set("file", new Blob([new Uint8Array(file)], { type: "text/csv" }), "audience.csv");

  const upload = await fetch(`${API}/dmp/custom_audience/file/upload/`, {
    method: "POST",
    headers: authHeaders(secrets.accessToken, false),
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  const uploaded = (await readJson(upload)) as {
    code?: number;
    data?: { file_path?: string; file_paths?: string[] };
  } | null;
  if (upload.status === 401 || uploaded?.code === 40100) throw new CabinetAuthError();
  const filePath = uploaded?.data?.file_path ?? uploaded?.data?.file_paths?.[0];
  if (!upload.ok || !filePath || (uploaded?.code != null && uploaded.code !== 0)) {
    throw new Error("Не вдалося завантажити файл списку в TikTok");
  }

  const create = await fetch(`${API}/dmp/custom_audience/create/`, {
    method: "POST",
    headers: authHeaders(secrets.accessToken),
    body: JSON.stringify({
      advertiser_id: secrets.externalAccountId,
      custom_audience_name: name,
      calculate_type: "MULTIPLE_TYPES",
      file_paths: [filePath],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const created = (await readJson(create)) as { code?: number; data?: { custom_audience_id?: string } } | null;
  if (create.status === 401 || created?.code === 40100) throw new CabinetAuthError();
  const id = created?.data?.custom_audience_id;
  if (!create.ok || !id || (created?.code != null && created.code !== 0)) {
    throw new Error("Не вдалося створити список у TikTok");
  }
  return id;
}

export function tiktokCampaignUrl(advertiserId: string): string {
  return `https://ads.tiktok.com/i18n/perf/campaign?aadvid=${encodeURIComponent(advertiserId)}`;
}
