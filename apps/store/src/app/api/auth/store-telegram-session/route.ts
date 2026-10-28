import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

/**
 * Exchange Mini App initData for store sessions and set the cabinet cookie.
 * Keeps store_tg token in the JSON body for cart/checkout Authorization.
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

  const response = NextResponse.json({
    token: payload.token,
    cartSessionId: payload.cartSessionId,
    phone: payload.phone ?? null,
    firstName: payload.firstName ?? null,
    lastName: payload.lastName ?? null,
    contactId: payload.contactId ?? null,
    customerId: payload.customerId ?? null,
    loggedIn: Boolean(payload.loggedIn && payload.storeToken),
  });

  if (payload.storeToken) {
    response.cookies.set("store_token", payload.storeToken, {
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      httpOnly: true,
      sameSite: "lax",
    });
  }

  return response;
}
