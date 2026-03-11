import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { API_URL } from "@/lib/api/config";

type ActivityItem = {
  id: string;
  type: string;
  title?: string;
  body: string;
  occurredAt?: string;
  createdAt?: string;
  createdBy?: string;
  call?: {
    direction?: string;
    status?: string;
    durationSec?: number | null;
    recordingStatus?: string | null;
    recordingUrl?: string | null;
    startedAt?: string;
    from?: string;
    to?: string;
  };
};

type ActivitiesResponse = { items?: ActivityItem[] };

type TimelineItem = {
  id: string;
  source: "ACTIVITY";
  type: string;
  title: string;
  body: string;
  occurredAt: string;
  createdAt: string;
  createdBy: string;
   call?: {
    direction?: string;
    status?: string;
    durationSec?: number;
    recordingStatus?: string;
    recordingUrl?: string;
    startedAt?: string;
    from?: string;
    to?: string;
  };
};

const titleFor = (type: string): string => {
  if (type === "CALL") return "Звонок";
  if (type === "MEETING") return "Встреча";
  if (type === "COMMENT") return "Комментарий";
  return type;
};

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const token = (await cookies()).get("token")?.value;
  const { id } = await ctx.params;

  const r = await fetch(`${API_URL}/contacts/${id}/activities`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });

  const text = await r.text();
  if (!r.ok) {
    return new NextResponse(text, {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const data = JSON.parse(text) as ActivitiesResponse;

  const items: TimelineItem[] = (data.items ?? []).map((a) => {
    const occurredAt = a.occurredAt ?? a.createdAt ?? new Date().toISOString();
    const createdAt = a.createdAt ?? occurredAt;
    const rawCall = (a as ActivityItem).call;
    const call =
      rawCall && typeof rawCall === "object"
        ? {
            direction: rawCall.direction ?? undefined,
            status: rawCall.status ?? undefined,
            durationSec:
              typeof rawCall.durationSec === "number" ? rawCall.durationSec : undefined,
            recordingStatus: rawCall.recordingStatus ?? undefined,
            recordingUrl: rawCall.recordingUrl ?? undefined,
            startedAt: rawCall.startedAt ?? occurredAt,
            from: rawCall.from ?? undefined,
            to: rawCall.to ?? undefined,
          }
        : undefined;
    return {
      id: a.id,
      source: "ACTIVITY",
      type: a.type,
      title: a.title?.trim() ? a.title : titleFor(a.type),
      body: a.body ?? "",
      occurredAt,
      createdAt,
      createdBy: a.createdBy ?? "system",
      call,
    };
  });

  items.sort((x, y) => +new Date(y.occurredAt) - +new Date(x.occurredAt));
  return NextResponse.json({ items });
}
