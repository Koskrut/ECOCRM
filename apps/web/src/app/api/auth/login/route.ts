import { NextResponse } from "next/server";
import { API_URL } from "@/lib/api/config";
import { isSecureRequest } from "@/lib/cookie-secure";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  let r: Response;
  try {
    r = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    return NextResponse.json(data, { status: r.status });
  }

  const token = data.token ?? data.accessToken;
  const res = NextResponse.json({ ok: true });

  if (token) {
    res.cookies.set("token", token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: isSecureRequest(req),
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
  }

  return res;
}
