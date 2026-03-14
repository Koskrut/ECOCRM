import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { API_URL } from "@/lib/api/config";

async function authHeader(): Promise<Record<string, string>> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function GET(req: Request) {
  const headers = await authHeader();
  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  const upstream = `${API_URL}/dashboard/stats${qs ? `?${qs}` : ""}`;

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
        { status: 503 }
      );
    }
    throw e;
  }

  const text = await r.text().catch(() => "");
  try {
    const data = text ? JSON.parse(text) : {};
    return NextResponse.json(data, { status: r.status });
  } catch {
    return new NextResponse(text, { status: r.status });
  }
}
