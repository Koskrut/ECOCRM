// apps/web/src/app/api/orders/[id]/ttn/route.ts
import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const id = ctx.params.id;

    const body = await req.json().catch(() => ({}));

    // прокидываем авторизацию/куки как в остальных routes (если используешь cookie auth — оставь как есть)
    const r = await fetch(`${API_URL}/orders/${id}/np/ttn`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // если у тебя auth по Bearer в cookie/headers — прокинь:
        Authorization: req.headers.get("authorization") ?? "",
        Cookie: req.headers.get("cookie") ?? "",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data = await r.json().catch(() => ({}));
    return NextResponse.json(data, { status: r.status });
  } catch (e: any) {
    return NextResponse.json(
      { message: "orders/:id/ttn proxy failed", error: String(e?.message || e) },
      { status: 500 },
    );
  }
}
