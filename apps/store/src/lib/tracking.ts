import { canTrackAnalytics, canTrackMarketing, readConsent } from "@/lib/consent";

export type TrackingEventName =
  | "view_landing"
  | "cta_click"
  | "form_start"
  | "form_submit"
  | "lead_created"
  | "thank_you_view"
  | "call_click"
  | "whatsapp_click";

export type TrackingPayload = Record<string, unknown>;

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    __suprexGtmLoaded?: boolean;
    __suprexGaLoaded?: boolean;
    __suprexMetaLoaded?: boolean;
    _fbq?: (...args: unknown[]) => void;
    __suprexTrackingConfig?: {
      gaId?: string;
      gtmId?: string;
      metaPixelId?: string;
    };
  }
}

const ENV_GA_ID = process.env.NEXT_PUBLIC_GA_ID?.trim();
const ENV_GTM_ID = process.env.NEXT_PUBLIC_GTM_ID?.trim();
const ENV_META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();

function getRuntimeIds() {
  const cfg = typeof window !== "undefined" ? window.__suprexTrackingConfig : undefined;
  return {
    gaId: cfg?.gaId?.trim() || ENV_GA_ID,
    gtmId: cfg?.gtmId?.trim() || ENV_GTM_ID,
    metaPixelId: cfg?.metaPixelId?.trim() || ENV_META_PIXEL_ID,
  };
}

function canDispatch(eventName: TrackingEventName): boolean {
  if (eventName === "lead_created" || eventName === "thank_you_view" || eventName === "whatsapp_click") {
    return canTrackMarketing();
  }
  return canTrackAnalytics();
}

function injectScript(src: string): HTMLScriptElement {
  const script = document.createElement("script");
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
  return script;
}

function ensureGtmLoaded() {
  const { gtmId } = getRuntimeIds();
  if (!gtmId || typeof window === "undefined" || window.__suprexGtmLoaded) return;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
  injectScript(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`);
  window.__suprexGtmLoaded = true;
}

/** Align Google Consent Mode with our banner (GTM often sets defaults to denied). */
export function syncGtagConsentFromLocalState() {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  const { analytics, marketing } = readConsent();
  window.gtag("consent", "update", {
    analytics_storage: analytics ? "granted" : "denied",
    ad_storage: marketing ? "granted" : "denied",
    ad_user_data: marketing ? "granted" : "denied",
    ad_personalization: marketing ? "granted" : "denied",
  });
}

function ensureGaLoaded() {
  const { gaId, gtmId } = getRuntimeIds();
  // If GTM is configured, GA should be routed by GTM to avoid duplicate events.
  if (!gaId || gtmId || typeof window === "undefined" || window.__suprexGaLoaded) return;
  window.dataLayer = window.dataLayer ?? [];
  injectScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`);
  // Canonical stub — must use `arguments` (not rest/spread) for gtag.js queue processing.
  window.gtag = function gtag() {
    window.dataLayer?.push(arguments as unknown as Record<string, unknown>);
  };
  window.gtag("js", new Date());
  syncGtagConsentFromLocalState();
  window.gtag("config", gaId, { anonymize_ip: true });
  window.__suprexGaLoaded = true;
}

function ensureMetaLoaded() {
  const { metaPixelId } = getRuntimeIds();
  if (!metaPixelId || typeof window === "undefined" || window.__suprexMetaLoaded) return;
  // Use the canonical Meta Pixel bootstrap (inline snippet). A custom fbq stub
  // can cause fbevents.js to fail to initialize and never register pixels.
  const scriptId = "suprex-meta-pixel";
  if (document.getElementById(scriptId)) {
    window.__suprexMetaLoaded = true;
    return;
  }

  // If something already created a broken fbq/_fbq stub, reset it so the
  // canonical bootstrap can run.
  try {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (window as unknown as { fbq?: unknown }).fbq;
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (window as unknown as { _fbq?: unknown })._fbq;
  } catch {
    // ignore
  }

  const inline = `
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${metaPixelId.replace(/'/g, "\\'")}');
fbq('track', 'PageView');
  `.trim();

  const script = document.createElement("script");
  script.id = scriptId;
  script.text = inline;
  document.head.appendChild(script);
  window.__suprexMetaLoaded = true;
}

export function ensureTrackingReady() {
  if (typeof window === "undefined") return;
  if (canTrackAnalytics()) {
    ensureGtmLoaded();
    ensureGaLoaded();
  }
  if (canTrackMarketing()) {
    ensureMetaLoaded();
  }
}

export function trackEvent(eventName: TrackingEventName, payload: TrackingPayload = {}) {
  if (typeof window === "undefined") return;
  ensureTrackingReady();
  if (!canDispatch(eventName)) return;
  const { gtmId } = getRuntimeIds();

  const eventPayload = {
    event: eventName,
    timestamp: new Date().toISOString(),
    ...payload,
  };

  if (gtmId) {
    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push(eventPayload);
  }
  if (!gtmId && typeof window.gtag === "function") {
    window.gtag("event", eventName, payload);
  }
  if (typeof window.fbq === "function") {
    window.fbq("trackCustom", eventName, payload);
  }
}

