import { NextResponse } from "next/server";
import { isSecureRequest } from "@/lib/cookie-secure";

export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("token", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isSecureRequest(req),
    maxAge: 0,
  });
  return res;
}
