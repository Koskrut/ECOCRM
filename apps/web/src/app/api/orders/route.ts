import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

function decodeJwtSub(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1];
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const data = JSON.parse(json);
    return typeof data?.sub === "string" ? data.sub : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const token = (await cookies()).get("token")?.value;

  const url = new URL(req.url);
  const qs = url.searchParams.toString();

  const r = await fetch(`${API_URL}/orders${qs ? `?${qs}` : ""}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });

  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: Request) {
  const token = (await cookies()).get("token")?.value;

  const raw = await req.text();
  let body: any = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }

  // ✅ если ownerId не передали — берем из JWT sub
  if (!body.ownerId && token) {
    const sub = decodeJwtSub(token);
    if (sub) body.ownerId = sub;
  }

  const r = await fetch(`${API_URL}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { "Content-Type": "application/json" },
  });
}
