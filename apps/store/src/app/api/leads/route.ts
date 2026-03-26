import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

type LeadPayload = {
  name?: string;
  phone?: string;
  email?: string;
  company?: string;
  roleSegment?: string;
  message?: string;
  formType?: string;
  consent?: boolean;
  attribution?: unknown;
};

function isValid(payload: LeadPayload): { ok: true } | { ok: false; message: string } {
  if (!payload.name?.trim()) return { ok: false, message: "Вкажіть ім'я" };
  if (!payload.phone?.trim() && !payload.email?.trim()) {
    return { ok: false, message: "Вкажіть телефон або email" };
  }
  if (!payload.formType?.trim()) return { ok: false, message: "Невірний тип форми" };
  if (payload.consent !== true) return { ok: false, message: "Потрібна згода на обробку даних" };
  return { ok: true };
}

export async function POST(req: NextRequest) {
  let body: LeadPayload;
  try {
    body = (await req.json()) as LeadPayload;
  } catch {
    return NextResponse.json({ message: "Невірний JSON payload" }, { status: 400 });
  }

  const validation = isValid(body);
  if (!validation.ok) return NextResponse.json({ message: validation.message }, { status: 400 });

  const target = `${API_URL}/store/leads`;
  const res = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({ message: "Lead submit failed" }));
  if (!res.ok) {
    return NextResponse.json(
      { message: (data as { message?: string }).message ?? "Lead submit failed" },
      { status: res.status },
    );
  }
  return NextResponse.json(data, { status: 200 });
}

