export type TouchPoint = {
  timestamp: string;
  landingPage: string;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  gclid: string | null;
  fbclid: string | null;
};

export type AttributionSnapshot = {
  firstTouch: TouchPoint | null;
  latestTouch: TouchPoint | null;
  pageUrl: string;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  gclid: string | null;
  fbclid: string | null;
  capturedAt: string;
};

const KEY = "suprex_attribution_v1";

function readStore(): { firstTouch: TouchPoint | null; latestTouch: TouchPoint | null } {
  if (typeof window === "undefined") return { firstTouch: null, latestTouch: null };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { firstTouch: null, latestTouch: null };
    const parsed = JSON.parse(raw) as { firstTouch?: TouchPoint | null; latestTouch?: TouchPoint | null };
    return {
      firstTouch: parsed.firstTouch ?? null,
      latestTouch: parsed.latestTouch ?? null,
    };
  } catch {
    return { firstTouch: null, latestTouch: null };
  }
}

function writeStore(value: { firstTouch: TouchPoint | null; latestTouch: TouchPoint | null }) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(value));
}

function getParam(url: URL, key: string): string | null {
  const value = url.searchParams.get(key);
  return value && value.trim() ? value.trim() : null;
}

function hasAttribution(tp: TouchPoint): boolean {
  return Boolean(
    tp.utmSource ||
      tp.utmMedium ||
      tp.utmCampaign ||
      tp.utmContent ||
      tp.utmTerm ||
      tp.gclid ||
      tp.fbclid,
  );
}

export function captureAttributionFromLocation() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const touch: TouchPoint = {
    timestamp: new Date().toISOString(),
    landingPage: `${url.pathname}${url.search}`,
    referrer: document.referrer || null,
    utmSource: getParam(url, "utm_source"),
    utmMedium: getParam(url, "utm_medium"),
    utmCampaign: getParam(url, "utm_campaign"),
    utmContent: getParam(url, "utm_content"),
    utmTerm: getParam(url, "utm_term"),
    gclid: getParam(url, "gclid"),
    fbclid: getParam(url, "fbclid"),
  };
  const store = readStore();
  const next = { ...store };
  if (hasAttribution(touch) && !store.firstTouch) next.firstTouch = touch;
  if (hasAttribution(touch)) next.latestTouch = touch;
  if (!next.latestTouch && !next.firstTouch) return;
  writeStore(next);
}

export function getAttributionSnapshot(): AttributionSnapshot {
  const now = new Date().toISOString();
  if (typeof window === "undefined") {
    return {
      firstTouch: null,
      latestTouch: null,
      pageUrl: "",
      referrer: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmContent: null,
      utmTerm: null,
      gclid: null,
      fbclid: null,
      capturedAt: now,
    };
  }
  const url = new URL(window.location.href);
  const store = readStore();
  const latest = store.latestTouch;
  return {
    firstTouch: store.firstTouch,
    latestTouch: latest,
    pageUrl: window.location.href,
    referrer: document.referrer || null,
    utmSource: getParam(url, "utm_source") ?? latest?.utmSource ?? null,
    utmMedium: getParam(url, "utm_medium") ?? latest?.utmMedium ?? null,
    utmCampaign: getParam(url, "utm_campaign") ?? latest?.utmCampaign ?? null,
    utmContent: getParam(url, "utm_content") ?? latest?.utmContent ?? null,
    utmTerm: getParam(url, "utm_term") ?? latest?.utmTerm ?? null,
    gclid: getParam(url, "gclid") ?? latest?.gclid ?? null,
    fbclid: getParam(url, "fbclid") ?? latest?.fbclid ?? null,
    capturedAt: now,
  };
}

