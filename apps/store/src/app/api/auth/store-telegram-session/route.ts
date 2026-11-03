import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

/**
 * Exchange Mini App initData for store sessions and set the cabinet cookie.
 * Also returns storeToken in JSON — Telegram WebViews often block httpOnly cookies;
 * the client keeps a sessionStorage copy for Authorization on /me.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${API_URL}/store/telegram/webapp-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { message: (data as { message?: string }).message ?? "Telegram session failed" },
      { status: res.status },
    );
  }

  const payload = data as {
    token?: string;
    storeToken?: string | null;
    cartSessionId?: string;
    phone?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    contactId?: string | null;
    customerId?: string | null;
    loggedIn?: boolean;
  };

  const loggedIn = Boolean(payload.loggedIn && payload.storeToken);
  const response = NextResponse.json({
    token: payload.token,
    // Client stores this when cookie is unavailable inside Telegram WebView.
    storeToken: loggedIn ? payload.storeToken ?? null : null,
    cartSessionId: payload.cartSessionId,
    phone: payload.phone ?? null,
    firstName: payload.firstName ?? null,
    lastName: payload.lastName ?? null,
    contactId: payload.contactId ?? null,
    customerId: payload.customerId ?? null,
    loggedIn,
  });

  if (payload.storeToken) {
    const host = req.headers.get("host") ?? "";
    const forwardedProto = req.headers.get("x-forwarded-proto") ?? "";
    const secure =
      forwardedProto === "https" ||
      (!host.startsWith("localhost") && !host.startsWith("127."));
    response.cookies.set("store_token", payload.storeToken, {
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      httpOnly: true,
      // Telegram iOS/Android WebView: None+Secure survives better than Lax.
      sameSite: secure ? "none" : "lax",
      secure,
    });
  }

  return response;
}
