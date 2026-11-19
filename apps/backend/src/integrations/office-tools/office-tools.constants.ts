/** `IntegrationSetting.provider` for Office Tools (GMS). */
export const OFFICE_TOOLS_PROVIDER = "OFFICE_TOOLS";

export const OFFICE_TOOLS_INTEGRATION = "office_tools";

export const OFFICE_TOOLS_DEFAULT_BASE_URL =
  "https://implants-sandbox.gms-inbound.com.ua/webhooks/demo";

export const OFFICE_TOOLS_ENTITY = {
  CONTACT: "CONTACT",
  PRODUCT: "PRODUCT",
  WAREHOUSE: "WAREHOUSE",
  ORDER: "ORDER",
} as const;

export type OfficeToolsEntityType =
  (typeof OFFICE_TOOLS_ENTITY)[keyof typeof OFFICE_TOOLS_ENTITY];
