import { apiHttp } from "@/lib/api/client";
import type { SystemModulesResponse } from "./modules.types";

export async function fetchSystemModules(): Promise<SystemModulesResponse> {
  const res = await apiHttp.get<SystemModulesResponse>("/system/modules");
  return res.data ?? { modules: [] };
}
