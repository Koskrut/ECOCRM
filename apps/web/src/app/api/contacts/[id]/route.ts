import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

const json = (text: string, status: number) =>
  new NextResponse(text, {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function forward(
  req: Request,
  id: string,
  method: "PATCH" | "PUT",
) {
  const token = (await cookies()).get("token")?.value;
  const body = await req.text();

  const r = await fetch(`${API_URL}/contacts/${id}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  });

  return json(await r.text(), r.status);
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const token = (await cookies()).get("token")?.value;

  const r = await fetch(`${API_URL}/contacts/${id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  return json(await r.text(), r.status);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return forward(req, id, "PATCH");
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return forward(req, id, "PUT");
}
