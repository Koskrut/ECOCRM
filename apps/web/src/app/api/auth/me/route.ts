import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { API_URL } from "@/lib/api/config";

export async function GET() {
  const token = (await cookies()).get("token")?.value;

  let r: Response;
  try {
    r = await fetch(`${API_URL}/auth/me`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    });
  } catch (e) {
    const code = (e as { cause?: { code?: string } })?.cause?.code;
    if (code === "ECONNRESET" || (e as Error).message?.includes("ECONNRESET")) {
      return NextResponse.json(
        { message: "Backend unavailable. Start the API server (e.g. npm run dev in apps/backend)." },
        { status: 503 }
      );
    }
    throw e;
  }

  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { "Content-Type": "application/json" },
  });
}
