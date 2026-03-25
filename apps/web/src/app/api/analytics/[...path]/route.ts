import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { API_URL } from "@/lib/api/config";

async function authHeader(): Promise<Record<string, string>> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function GET(
  req: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  const headers = await authHeader();
  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  const { path: segments } = await context.params;
  const path = (segments ?? []).join("/");
  const upstream = `${API_URL}/analytics/${path}${qs ? `?${qs}` : ""}`;

  let r: Response;
  try {
    r = await fetch(upstream, {
      method: "GET",
      headers: { ...headers },
      cache: "no-store",
    });
  } catch (e) {
    const code = (e as { cause?: { code?: string } })?.cause?.code;
    if (code === "ECONNRESET" || (e as Error).message?.includes("ECONNRESET")) {
      return NextResponse.json(
        { message: "Backend unavailable. Start the API server (e.g. npm run dev in apps/backend)." },
        { status: 503 },
      );
    }
    throw e;
  }

  const text = await r.text().catch(() => "");
  try {
    const data = text ? JSON.parse(text) : null;
    return NextResponse.json(data, { status: r.status });
  } catch {
    return new NextResponse(text, { status: r.status });
  }
}
