export type ConsentState = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  updatedAt: string;
};

const CONSENT_KEY = "suprex_consent_v1";

const defaultConsent: ConsentState = {
  necessary: true,
  analytics: false,
  marketing: false,
  updatedAt: new Date(0).toISOString(),
};

export function readConsent(): ConsentState {
  if (typeof window === "undefined") return defaultConsent;
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    if (!raw) return defaultConsent;
    const parsed = JSON.parse(raw) as Partial<ConsentState>;
    return {
      necessary: true,
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return defaultConsent;
  }
}

export function writeConsent(next: Pick<ConsentState, "analytics" | "marketing">): ConsentState {
  const value: ConsentState = {
    necessary: true,
    analytics: next.analytics,
    marketing: next.marketing,
    updatedAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("suprex:consent-updated", { detail: value }));
  }
  return value;
}

export function hasConsent(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(CONSENT_KEY) != null;
}

export function canTrackAnalytics(): boolean {
  return readConsent().analytics;
}

export function canTrackMarketing(): boolean {
  return readConsent().marketing;
}

