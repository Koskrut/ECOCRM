export type DeliveryStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "UNKNOWN";

export type RemoteInsight = {
  campaignExternalId: string;
  adSetExternalId: string;
  adExternalId: string;
  campaignName: string | null;
  adSetName: string | null;
  adName: string | null;
  deliveryStatus: DeliveryStatus;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  currency: string;
};

export type CabinetSecrets = {
  platform: "META" | "GOOGLE" | "TIKTOK";
  externalAccountId: string;
  currency: string;
  accessToken: string | null;
  pixelId: string | null;
  developerToken: string | null;
  loginCustomerId: string | null;
  clientId: string | null;
  clientSecret: string | null;
  /** Google Ads conversion action numeric ids from settings (not placeholder names). */
  qualityConversionActionId: string | null;
  junkConversionActionId: string | null;
  purchaseConversionActionId: string | null;
};

export type HashedPerson = {
  phoneHash: string | null;
  emailHash: string | null;
  firstNameHash: string | null;
  lastNameHash: string | null;
  cityHash: string | null;
};

export type OutcomeEvent = {
  kind: "LEAD" | "QUALITY" | "JUNK" | "PURCHASE";
  eventId: string;
  eventTime: Date;
  clickId: string | null;
  valueAmount: number | null;
  valueCurrency: string | null;
  person: HashedPerson;
};

export class CabinetAuthError extends Error {
  constructor() {
    super("Потрібне повторне підключення");
    this.name = "CabinetAuthError";
  }
}

export async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}
