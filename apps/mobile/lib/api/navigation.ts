import { apiFetch } from "@/lib/api";

export type NavigationResponse = { url: string };

export const navigationApi = {
  getUrl: (
    token: string,
    params: { date: string; mode?: "single" | "multi"; visitId?: string },
  ) => {
    const q = new URLSearchParams();
    q.set("date", params.date);
    q.set("mode", params.mode ?? "single");
    if (params.visitId) q.set("visitId", params.visitId);
    return apiFetch<NavigationResponse>(`/route-plans/navigation?${q.toString()}`, { token });
  },
};
