import type { CabinetSecrets, HashedPerson, OutcomeEvent, RemoteInsight } from "./types";
import { CabinetAuthError, readJson } from "./types";

const ADS = "https://googleads.googleapis.com/v18";

function customerId(value: string): string {
  return value.replace(/-/g, "");
}

async function accessToken(secrets: CabinetSecrets): Promise<string> {
  const token = secrets.accessToken?.trim() ?? "";
  if (!token) throw new CabinetAuthError();
  if (!token.startsWith("1//")) return token;
  if (!secrets.clientId || !secrets.clientSecret) throw new CabinetAuthError();
  const body = new URLSearchParams({
    client_id: secrets.clientId,
    client_secret: secrets.clientSecret,
    refresh_token: token,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  const parsed = (await readJson(response)) as { access_token?: string } | null;
  if (!response.ok || !parsed?.access_token) throw new CabinetAuthError();
  return parsed.access_token;
}

function headers(secrets: CabinetSecrets, token: string): Headers {
  const result = new Headers();
  result.set("authorization", `Bearer ${token}`);
  result.set("developer-token", secrets.developerToken ?? "");
  if (secrets.loginCustomerId) result.set("login-customer-id", customerId(secrets.loginCustomerId));
  result.set("content-type", "application/json");
  return result;
}

export async function pullGoogleInsights(secrets: CabinetSecrets, since: string, until: string): Promise<RemoteInsight[]> {
  if (!secrets.developerToken) throw new CabinetAuthError();
  const token = await accessToken(secrets);
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      ad_group.id,
      ad_group.name,
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.status,
      segments.date,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks
    FROM ad_group_ad
    WHERE segments.date BETWEEN '${since}' AND '${until}'
  `;
  const response = await fetch(`${ADS}/customers/${customerId(secrets.externalAccountId)}/googleAds:search`, {
    method: "POST",
    headers: headers(secrets, token),
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 401 || response.status === 403) throw new CabinetAuthError();
  const body = await readJson(response);
  if (!response.ok) throw new Error("Не вдалося оновити дані кабінету Google");
  const results =
    (body as { results?: Array<Record<string, unknown>> } | null)?.results ??
    (Array.isArray(body) ? body.flatMap((chunk) => (chunk as { results?: Array<Record<string, unknown>> }).results ?? []) : []);
  const rows: RemoteInsight[] = [];
  for (const row of results) {
    const campaign = (row.campaign ?? {}) as { id?: string; name?: string; status?: string };
    const adGroup = (row.adGroup ?? {}) as { id?: string; name?: string };
    const ad = ((row.adGroupAd ?? {}) as { ad?: { id?: string; name?: string }; status?: string }).ad;
    const status = ((row.adGroupAd ?? {}) as { status?: string }).status ?? campaign.status;
    const segments = (row.segments ?? {}) as { date?: string };
    const metrics = (row.metrics ?? {}) as { costMicros?: string; impressions?: string; clicks?: string };
    if (!ad?.id || !segments.date) continue;
    const mapped = status === "ENABLED" ? "ACTIVE" : status === "PAUSED" ? "PAUSED" : status === "REMOVED" ? "COMPLETED" : "UNKNOWN";
    rows.push({
      campaignExternalId: String(campaign.id ?? ""),
      adSetExternalId: String(adGroup.id ?? ""),
      adExternalId: String(ad.id),
      campaignName: campaign.name ?? null,
      adSetName: adGroup.name ?? null,
      adName: ad.name ?? null,
      deliveryStatus: mapped,
      date: segments.date,
      spend: Number(metrics.costMicros ?? 0) / 1_000_000,
      impressions: Number(metrics.impressions ?? 0),
      clicks: Number(metrics.clicks ?? 0),
      currency: secrets.currency,
    });
  }
  return rows;
}

function googleConversionActionId(secrets: CabinetSecrets, kind: OutcomeEvent["kind"]): string {
  const id =
    kind === "PURCHASE"
      ? secrets.purchaseConversionActionId
      : kind === "JUNK"
        ? secrets.junkConversionActionId
        : secrets.qualityConversionActionId;
  const trimmed = id?.trim() ?? "";
  if (!trimmed) {
    throw new Error(
      kind === "PURCHASE"
        ? "У налаштуваннях Google не вказано дію для оплат"
        : kind === "JUNK"
          ? "У налаштуваннях Google не вказано дію для неякісних заявок"
          : "У налаштуваннях Google не вказано дію для якісних заявок",
    );
  }
  return trimmed.replace(/\D/g, "") || trimmed;
}

export async function sendGoogleOutcome(secrets: CabinetSecrets, event: OutcomeEvent): Promise<string> {
  if (!secrets.developerToken) throw new CabinetAuthError();
  const token = await accessToken(secrets);
  const conversionAction = googleConversionActionId(secrets, event.kind);
  const response = await fetch(
    `${ADS}/customers/${customerId(secrets.externalAccountId)}:uploadClickConversions`,
    {
      method: "POST",
      headers: headers(secrets, token),
      body: JSON.stringify({
        partialFailure: true,
        conversions: [
          {
            gclid: event.clickId,
            conversionDateTime: event.eventTime.toISOString().replace("T", " ").replace("Z", "+00:00"),
            ...(event.kind === "PURCHASE" && event.valueAmount != null
              ? { conversionValue: event.valueAmount, currencyCode: event.valueCurrency ?? secrets.currency }
              : {}),
            orderId: event.eventId,
            conversionAction: `customers/${customerId(secrets.externalAccountId)}/conversionActions/${conversionAction}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (response.status === 401 || response.status === 403) throw new CabinetAuthError();
  if (!response.ok) throw new Error("Не вдалося передати результат у Google");
  return event.eventId;
}

export async function uploadGoogleAudience(secrets: CabinetSecrets, name: string, people: HashedPerson[]): Promise<string> {
  if (!secrets.developerToken) throw new CabinetAuthError();
  const token = await accessToken(secrets);
  const create = await fetch(`${ADS}/customers/${customerId(secrets.externalAccountId)}/userLists:mutate`, {
    method: "POST",
    headers: headers(secrets, token),
    body: JSON.stringify({
      operations: [{ create: { name, membershipLifeSpan: 30, crmBasedUserList: { uploadKeyType: "CONTACT_INFO" } } }],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (create.status === 401 || create.status === 403) throw new CabinetAuthError();
  const created = (await readJson(create)) as { results?: Array<{ resourceName?: string }> } | null;
  const resource = created?.results?.[0]?.resourceName;
  if (!create.ok || !resource) throw new Error("Кабінет Google ще не підключено для списків");
  const job = await fetch(`${ADS}/customers/${customerId(secrets.externalAccountId)}/offlineUserDataJobs:create`, {
    method: "POST",
    headers: headers(secrets, token),
    body: JSON.stringify({ job: { type: "CUSTOMER_MATCH_USER_LIST", customerMatchUserListMetadata: { userList: resource } } }),
    signal: AbortSignal.timeout(20_000),
  });
  const jobBody = (await readJson(job)) as { resourceName?: string } | null;
  if (!job.ok || !jobBody?.resourceName) throw new Error("Не вдалося оновити список у Google");
  await fetch(`${ADS}/${jobBody.resourceName}:addOperations`, {
    method: "POST",
    headers: headers(secrets, token),
    body: JSON.stringify({
      operations: people.slice(0, 5000).map((person) => ({
        create: {
          userIdentifiers: [
            person.emailHash ? { hashedEmail: person.emailHash } : undefined,
            person.phoneHash ? { hashedPhoneNumber: person.phoneHash } : undefined,
          ].filter(Boolean),
        },
      })),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  await fetch(`${ADS}/${jobBody.resourceName}:run`, {
    method: "POST",
    headers: headers(secrets, token),
    signal: AbortSignal.timeout(20_000),
  });
  return resource;
}

export function googleCampaignUrl(customer: string, campaignId: string): string {
  return `https://ads.google.com/aw/campaigns?campaignId=${encodeURIComponent(campaignId)}&ocid=${encodeURIComponent(customerId(customer))}`;
}
