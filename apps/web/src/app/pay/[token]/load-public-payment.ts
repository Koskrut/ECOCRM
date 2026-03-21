import { API_URL } from "@/lib/api/config";
import type { PublicPayPayload } from "./public-pay.types";

function formatHttpError(status: number, text: string): string {
  if (status === 404) return "Посилання не знайдено.";
  try {
    const j = JSON.parse(text) as { message?: string | string[] };
    if (typeof j.message === "string") return j.message;
    if (Array.isArray(j.message)) return j.message.join(", ");
  } catch {
    /* plain text */
  }
  return text.trim() || `Помилка ${status}`;
}

/** Серверний виклик бекенду — сторінка /pay приходить уже з даними (без клієнтського fetch у WebView). */
export async function loadPublicPayment(token: string): Promise<{
  data: PublicPayPayload | null;
  error: string | null;
}> {
  const base = API_URL.replace(/\/+$/, "");
  const url = `${base}/public/payment-requests/by-token/${encodeURIComponent(token)}`;
  const controller = new AbortController();
  const kill = setTimeout(() => controller.abort(), 25_000);
  try {
    const r = await fetch(url, { cache: "no-store", signal: controller.signal });
    const text = await r.text();
    if (!r.ok) {
      return { data: null, error: formatHttpError(r.status, text) };
    }
    try {
      const data = JSON.parse(text) as PublicPayPayload;
      return { data, error: null };
    } catch {
      return { data: null, error: "Некоректна відповідь сервера." };
    }
  } catch (e: unknown) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      data: null,
      error: aborted
        ? "Час очікування вичерпано. Спробуйте оновити сторінку."
        : "Сервер тимчасово недоступний.",
    };
  } finally {
    clearTimeout(kill);
  }
}
