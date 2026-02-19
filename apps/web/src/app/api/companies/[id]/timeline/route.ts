import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

type ActivityItem = {
  id: string;
  type: string;
  body: string;
  occurredAt?: string;
  createdAt?: string;
  createdBy?: string;
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
};

const titleFor = (type: string): string => {
  if (type === "CALL") return "Звонок";
  if (type === "MEETING") return "Встреча";
  if (type === "COMMENT") return "Комментарий";
  return type;
};

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const token = (await cookies()).get("token")?.value;
  const { id } = await params;

  const r = await fetch(`${API_URL}/companies/${id}/activities`, {
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
    return {
      id: a.id,
      source: "ACTIVITY",
      type: a.type,
      title: titleFor(a.type),
      body: a.body ?? "",
      occurredAt,
      createdAt,
      createdBy: a.createdBy ?? "system",
    };
  });

  items.sort((x, y) => +new Date(y.occurredAt) - +new Date(x.occurredAt));
  return NextResponse.json({ items });
}
