export const ModuleIds = {
  CoreCrm: "core.crm",
  VoiceOutbound: "ext.voice_outbound",
  Finance: "ext.finance",
  ProductionPlanning: "ext.production_planning",
  IntegrationsTelegram: "int.integrations_telegram",
  NovaPoshta: "int.nova_poshta",
  GoogleSheet: "int.google_sheet",
  Bitrix: "int.bitrix",
  Ringostat: "int.ringostat",
} as const;

export type ModuleId = (typeof ModuleIds)[keyof typeof ModuleIds];
