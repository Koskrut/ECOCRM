import { NextResponse } from "next/server";
import { API_URL } from "@/lib/api/config";

export async function GET() {
  const r = await fetch(`${API_URL}/auth/telegram-widget-config`, {
    headers: { "Content-Type": "application/json" },
  });
  const data = await r.json().catch(() => ({ botUsername: null }));
  return NextResponse.json(data);
}
