export const ModuleIds = {
  CoreCrm: "core.crm",
  VoiceOutbound: "ext.voice_outbound",
  Finance: "ext.finance",
  IntegrationsTelegram: "ext.integrations_telegram",
} as const;

export type ModuleId = (typeof ModuleIds)[keyof typeof ModuleIds];
