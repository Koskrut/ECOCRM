import { META_DIRECT_LABEL } from "./marketing.constants";

const PAID_MEDIUM = new Set([
  "cpc",
  "ppc",
  "paid",
  "paidsocial",
  "paid_social",
  "cpm",
  "cpv",
  "cpa",
  "sem",
]);

export type AdPlatform = "META" | "GOOGLE" | "TIKTOK" | "OTHER";

export type ClickTouch = {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  ttclid?: string | null;
  referrer?: string | null;
};

export type LinkMatch = {
  id: string;
  channel: "FACEBOOK" | "INSTAGRAM" | "GOOGLE" | "TIKTOK" | "OTHER";
  campaignExternalId: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
};

export type AttributionDecision = {
  platform: AdPlatform | null;
  campaignExternalId: string | null;
  adSetExternalId: string | null;
  adExternalId: string | null;
  clickId: string | null;
  linkId: string | null;
  displayName: string | null;
  countsTowardAds: boolean;
  resolvedFrom: string;
};

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isPaid(medium: string | null | undefined): boolean {
  return PAID_MEDIUM.has(norm(medium));
}

function isMetaSource(source: string): boolean {
  return source === "facebook" || source === "fb" || source === "instagram" || source === "ig" || source === "meta";
}

function isGoogleSource(source: string): boolean {
  return source === "google" || source === "adwords" || source === "googleads" || source === "google_ads";
}

function isTiktokSource(source: string): boolean {
  return source === "tiktok" || source === "tt" || source === "tiktokads";
}

export function channelPlatform(channel: LinkMatch["channel"]): AdPlatform {
  if (channel === "FACEBOOK" || channel === "INSTAGRAM") return "META";
  if (channel === "GOOGLE") return "GOOGLE";
  if (channel === "TIKTOK") return "TIKTOK";
  return "OTHER";
}

export function matchMarketingLink(click: ClickTouch | null, links: LinkMatch[]): LinkMatch | null {
  if (!click) return null;
  const content = click.utmContent?.trim() ?? "";
  if (content) {
    const byId = links.find((link) => link.id === content || norm(link.utmContent) === norm(content));
    if (byId) return byId;
  }
  const source = norm(click.utmSource);
  const campaign = norm(click.utmCampaign);
  if (source && campaign) {
    return (
      links.find((link) => norm(link.utmSource) === source && norm(link.utmCampaign) === campaign) ?? null
    );
  }
  return null;
}

function blank(linkId: string | null, resolvedFrom: string): AttributionDecision {
  return {
    platform: null,
    campaignExternalId: null,
    adSetExternalId: null,
    adExternalId: null,
    clickId: null,
    linkId,
    displayName: null,
    countsTowardAds: false,
    resolvedFrom,
  };
}

/**
 * Paid platform comes from the ad or the click, never from Lead.source.
 * A store visit without a paid tag stays a site lead.
 */
export function resolveMarketingAttribution(input: {
  channel?: string | null;
  metaForm?: {
    campaignId?: string | null;
    adsetId?: string | null;
    adId?: string | null;
    campaignName?: string | null;
    adName?: string | null;
  } | null;
  direct?: {
    campaignId?: string | null;
    adsetId?: string | null;
    adId?: string | null;
    adName?: string | null;
  } | null;
  click?: ClickTouch | null;
  link?: LinkMatch | null;
  knownCampaignIds?: string[];
}): AttributionDecision {
  const form = input.metaForm;
  if (form || input.channel === "FB_LEAD_ADS" || input.channel === "IG_LEAD_ADS") {
    const name = form?.campaignName?.trim() || form?.adName?.trim() || null;
    return {
      platform: "META",
      campaignExternalId: form?.campaignId?.trim() || null,
      adSetExternalId: form?.adsetId?.trim() || null,
      adExternalId: form?.adId?.trim() || null,
      clickId: input.click?.fbclid?.trim() || null,
      linkId: null,
      displayName: name,
      countsTowardAds: true,
      resolvedFrom: "meta_form",
    };
  }

  const directId = input.direct?.adId?.trim();
  if (directId) {
    return {
      platform: "META",
      campaignExternalId: input.direct?.campaignId?.trim() || null,
      adSetExternalId: input.direct?.adsetId?.trim() || null,
      adExternalId: directId,
      clickId: input.click?.fbclid?.trim() || null,
      linkId: null,
      displayName: input.direct?.adName?.trim() || META_DIRECT_LABEL,
      countsTowardAds: true,
      resolvedFrom: "meta_direct",
    };
  }

  const click = input.click ?? null;
  let platform: AdPlatform | null = null;
  let resolvedFrom = "site";
  let clickId: string | null = null;
  const source = norm(click?.utmSource);
  if (click?.fbclid?.trim() || (isMetaSource(source) && isPaid(click?.utmMedium))) {
    platform = "META";
    resolvedFrom = "meta_click";
    clickId = click?.fbclid?.trim() || null;
  } else if (click?.gclid?.trim() || (isGoogleSource(source) && isPaid(click?.utmMedium))) {
    platform = "GOOGLE";
    resolvedFrom = "google_click";
    clickId = click?.gclid?.trim() || null;
  } else if (click?.ttclid?.trim() || (isTiktokSource(source) && isPaid(click?.utmMedium))) {
    platform = "TIKTOK";
    resolvedFrom = "tiktok_click";
    clickId = click?.ttclid?.trim() || null;
  }

  const link = input.link ?? null;
  if (!platform && link?.campaignExternalId) {
    const fromLink = channelPlatform(link.channel);
    if (fromLink !== "OTHER") {
      platform = fromLink;
      resolvedFrom = "paid_link";
    }
  }

  if (!platform) {
    return blank(link?.id ?? null, link ? "link_only" : "site");
  }

  let campaignExternalId: string | null = null;
  if (link?.campaignExternalId && channelPlatform(link.channel) === platform) {
    campaignExternalId = link.campaignExternalId;
  } else if (click?.utmCampaign && input.knownCampaignIds?.includes(click.utmCampaign)) {
    campaignExternalId = click.utmCampaign;
  }

  return {
    platform,
    campaignExternalId,
    adSetExternalId: null,
    adExternalId: null,
    clickId,
    linkId: link?.id ?? null,
    displayName: null,
    countsTowardAds: true,
    resolvedFrom,
  };
}

export function readClickFromSourceMeta(sourceMeta: unknown): ClickTouch | null {
  if (!sourceMeta || typeof sourceMeta !== "object") return null;
  const root = sourceMeta as Record<string, unknown>;
  const nested = root.attribution;
  const bag =
    nested && typeof nested === "object" ? (nested as Record<string, unknown>) : root;
  const latest =
    bag.latestTouch && typeof bag.latestTouch === "object"
      ? (bag.latestTouch as Record<string, unknown>)
      : null;
  const pick = (key: string): string | null => {
    const direct = bag[key];
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    const fromLatest = latest?.[key];
    if (typeof fromLatest === "string" && fromLatest.trim()) return fromLatest.trim();
    return null;
  };
  const click: ClickTouch = {
    utmSource: pick("utmSource"),
    utmMedium: pick("utmMedium"),
    utmCampaign: pick("utmCampaign"),
    utmContent: pick("utmContent"),
    utmTerm: pick("utmTerm"),
    gclid: pick("gclid"),
    fbclid: pick("fbclid"),
    ttclid: pick("ttclid"),
    referrer: pick("referrer"),
  };
  const any = Object.values(click).some((value) => value);
  return any ? click : null;
}
