import { apiHttp } from "../client";

export type KyivstarFmcLiveCall = {
  id: string;
  externalId: string;
  status: string;
  direction: string;
  customerPhone: string;
  customerPhoneNormalized: string | null;
  callControlId: string | null;
  liveState: string | null;
  startedAt: string;
  contact: { id: string; name: string } | null;
  lead: { id: string; name: string } | null;
  company: { id: string; name: string } | null;
};

export type KyivstarFmcWorkspace = {
  dial: { enabled: boolean; originatorPhone: string | null };
  liveCalls: KyivstarFmcLiveCall[];
};

export const kyivstarFmcApi = {
  workspace: async (): Promise<KyivstarFmcWorkspace> => {
    const res = await apiHttp.get<KyivstarFmcWorkspace>("/integrations/kyivstar-fmc/workspace");
    return res.data;
  },
  originate: async (destination: string): Promise<{ callControlId: string | null }> => {
    const res = await apiHttp.post<{ callControlId: string | null }>(
      "/integrations/kyivstar-fmc/originate",
      { destination },
    );
    return res.data;
  },
  reject: async (callControlId: string): Promise<void> => {
    await apiHttp.post("/integrations/kyivstar-fmc/callcontrol", {
      callControlId,
      action: "clear",
    });
  },
};
