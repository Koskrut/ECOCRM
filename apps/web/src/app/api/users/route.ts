import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

const json = (data: any, status = 200) =>
  new NextResponse(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export async function GET(req: Request) {
  try {
    const token = (await cookies()).get("token")?.value;

    const url = new URL(req.url);
    const qs = url.searchParams.toString();

    const r = await fetch(`${API_URL}/users${qs ? `?${qs}` : ""}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    });

    const text = await r.text();
    return new NextResponse(text, {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return json(
      {
        message: "users GET proxy failed",
        error: e instanceof Error ? e.message : String(e),
      },
      500,
    );
  }
}

export async function POST(req: Request) {
  try {
    const token = (await cookies()).get("token")?.value;
    const bodyText = await req.text();

    // backend ожидает JSON, поэтому валидируем тут
    let body: any = {};
    try {
      body = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      return json({ message: "Invalid JSON body" }, 400);
    }

    // быстрый чек: есть ли токен
    if (!token) {
      return json({ message: "Missing token cookie" }, 401);
    }

    const r = await fetch(`${API_URL}/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await r.text();
    return new NextResponse(text, {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return json(
      {
        message: "users POST proxy failed",
        apiUrl: API_URL,
        error: e instanceof Error ? e.message : String(e),
      },
      500,
    );
  }
}
