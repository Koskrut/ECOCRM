import type { CreateOutboundCallDto } from "./dto/create-outbound-call.dto";

function trimOrEmpty(v: string | undefined | null): string {
  if (v == null) return "";
  return String(v).trim();
}

/** Required CRM string fields: trim; if whitespace-only, keep original to avoid breaking validated body. */
function trimRequired(v: string): string {
  const t = v.trim();
  return t.length > 0 ? t : v;
}

/** Digits only — for phoneNormalized fallback (CRM-style). */
export function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Trim, strip inner whitespace runs, keep leading + and digits.
 * Does not validate country codes; safe normalization only.
 */
export function normalizePhoneE164Safety(phone: string): string {
  const t = phone.trim().replace(/\s+/g, " ").replace(/\s/g, "");
  if (!t) return "";
  const hasPlus = t.startsWith("+");
  const d = digitsOnly(t);
  if (!d) return t;
  return hasPlus ? `+${d}` : d;
}

function emptyToNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

/**
 * Inbound-only normalization after validation. Does not change CRM wire shape.
 */
export function normalizeCreateOutboundCallDto(body: CreateOutboundCallDto): CreateOutboundCallDto {
  const phoneRaw = trimRequired(body.phone);
  const phone = normalizePhoneE164Safety(phoneRaw) || phoneRaw;
  let phoneNormalized = emptyToNull(body.phoneNormalized as string | null | undefined);
  if (phoneNormalized == null && phone) {
    phoneNormalized = digitsOnly(phone);
  }

  const ctx = { ...body.context };
  const crm = { ...body.crmContext };

  const callback = body.callback
    ? {
        webhookUrl: trimRequired(body.callback.webhookUrl),
        webhookSecretHeader: trimOrEmpty(body.callback.webhookSecretHeader) || "x-outbound-voice-secret",
        publicBaseUrl: emptyToNull(body.callback.publicBaseUrl ?? undefined) ?? undefined,
      }
    : undefined;

  return {
    ...body,
    attemptId: trimRequired(body.attemptId),
    campaignId: trimRequired(body.campaignId),
    scenarioCode: trimRequired(body.scenarioCode),
    scenarioVersion: trimRequired(body.scenarioVersion),
    scenarioKey: trimRequired(body.scenarioKey),
    phone,
    phoneNormalized,
    leadId: emptyToNull(body.leadId as string | null | undefined),
    contactId: emptyToNull(body.contactId as string | null | undefined),
    companyId: emptyToNull(body.companyId as string | null | undefined),
    context: ctx,
    crmContext: crm,
    callback,
  };
}
