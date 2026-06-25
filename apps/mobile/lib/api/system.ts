import { apiFetch } from "@/lib/api";

export type SystemModuleState = {
  id: string;
  effective: boolean;
  enabled?: boolean;
  licensed?: boolean;
};

export type SystemModulesResponse = {
  modules: SystemModuleState[];
};

export const VISITS_MODULE_ID = "ext.visits";
export const NOVA_POSHTA_MODULE_ID = "int.nova_poshta";
export const MANUAL_CALLING_MODULE_ID = "ext.manual_calling";

export const systemApi = {
  listModules: (token: string) =>
    apiFetch<SystemModulesResponse>("/system/modules", { token }),

  isModuleEffective: (modules: SystemModuleState[], id: string): boolean =>
    modules.some((m) => m.id === id && m.effective),
};
