import { apiHttp } from "../client";

export type MeResponse = {
  user: {
    id: string;
    email: string;
    name?: string | null;
    role?: string | null;
  } | null;
};

export const authApi = {
  me: async (): Promise<MeResponse> => {
    const res = await apiHttp.get<MeResponse>("/auth/me");
    return res.data;
  },
};
