import { apiHttp } from "../client";

export type CannedResponseItem = {
  id: string;
  title: string;
  body: string;
  shortcut: string | null;
  sortOrder: number;
  createdBy: { id: string; fullName: string } | null;
  createdAt: string;
  updatedAt: string;
};

export type CannedResponseInput = {
  title: string;
  body: string;
  shortcut?: string | null;
  sortOrder?: number;
};

export const cannedResponsesApi = {
  list: async (): Promise<{ items: CannedResponseItem[] }> => {
    const res = await apiHttp.get<{ items: CannedResponseItem[] }>("/canned-responses");
    return res.data;
  },

  create: async (input: CannedResponseInput): Promise<CannedResponseItem> => {
    const res = await apiHttp.post<CannedResponseItem>("/canned-responses", input);
    return res.data;
  },

  update: async (
    id: string,
    input: Partial<CannedResponseInput>,
  ): Promise<CannedResponseItem> => {
    const res = await apiHttp.patch<CannedResponseItem>(`/canned-responses/${id}`, input);
    return res.data;
  },

  remove: async (id: string): Promise<{ ok: boolean }> => {
    const res = await apiHttp.delete<{ ok: boolean }>(`/canned-responses/${id}`);
    return res.data;
  },
};

export function applyCannedPlaceholders(
  body: string,
  ctx: { clientName?: string | null; phone?: string | null },
): string {
  return body
    .replaceAll("{clientName}", ctx.clientName?.trim() || "")
    .replaceAll("{phone}", ctx.phone?.trim() || "");
}
