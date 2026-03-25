"use client";

import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import { apiHttp } from "../../lib/api/client";

const CACHE_TTL_MS = 2 * 60 * 1000;
const CACHE_BUST_STORAGE_KEY = "crm:contact-card-ui:invalidate-at";
const CACHE_BUST_EVENT = "crm:contact-card-ui:invalidate";

let cachedContactCardV2: { value: boolean; at: number } | null = null;

function clearCachedContactCardV2() {
  cachedContactCardV2 = null;
}

function readCachedContactCardV2(): boolean | null {
  if (!cachedContactCardV2) return null;
  if (Date.now() - cachedContactCardV2.at > CACHE_TTL_MS) {
    clearCachedContactCardV2();
    return null;
  }
  return cachedContactCardV2.value;
}

function writeCachedContactCardV2(value: boolean) {
  cachedContactCardV2 = { value, at: Date.now() };
}

/** Скинути кеш після PATCH налаштування (коли з’явиться UI зміни прапора). */
export function invalidateContactCardUiCache() {
  clearCachedContactCardV2();
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_BUST_STORAGE_KEY, String(Date.now()));
  } catch {
    // ignore storage failures (private mode / quota / disabled storage)
  }
  window.dispatchEvent(new Event(CACHE_BUST_EVENT));
}

export function readContactCardV2FromEnv(): boolean {
  const v = process.env.NEXT_PUBLIC_CONTACT_CARD_V2;
  if (typeof v !== "string" || v.trim() === "") return true;
  return v.trim().toLowerCase() !== "false";
}

/**
 * Ефективний прапор v2: `NEXT_PUBLIC_CONTACT_CARD_V2` + `GET /settings/contact-card-ui`
 * (SystemSetting `contact_card_ui`). Якщо env = false — завжди legacy.
 * Поки відповіді сервера немає — legacy (не показуємо v2 до підтвердження, щоб уникнути миготіння,
 * коли на сервері v2 вимкнено). Успішна відповідь кешується на кілька хвилин, щоб повторні відкриття
 * модалки не завжди починали з legacy. Якщо env = true і запит впав — лишаємо env; якщо API повернув false — вимикаємо v2.
 */
export function useContactCardV2Effective(): boolean {
  const envV2 = useMemo(() => readContactCardV2FromEnv(), []);
  const [refreshKey, setRefreshKey] = useState(0);
  const [serverV2, setServerV2] = useState<boolean | "pending" | "err">(() => {
    if (!readContactCardV2FromEnv()) return "pending";
    const hit = readCachedContactCardV2();
    return hit ?? "pending";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const revalidate = () => {
      clearCachedContactCardV2();
      setServerV2("pending");
      setRefreshKey((k) => k + 1);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== CACHE_BUST_STORAGE_KEY) return;
      revalidate();
    };
    window.addEventListener(CACHE_BUST_EVENT, revalidate);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CACHE_BUST_EVENT, revalidate);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (!envV2) return;
    const hit = readCachedContactCardV2();
    if (hit !== null) {
      setServerV2(hit);
      return;
    }
    const ac = new AbortController();
    apiHttp
      .get<{ contactCardV2: boolean }>("/settings/contact-card-ui", { signal: ac.signal })
      .then((r) => {
        writeCachedContactCardV2(r.data.contactCardV2);
        setServerV2(r.data.contactCardV2);
      })
      .catch((e) => {
        if (axios.isCancel(e)) return;
        setServerV2("err");
      });
    return () => ac.abort();
  }, [envV2, refreshKey]);

  if (!envV2) return false;
  if (serverV2 === "pending") return false;
  if (serverV2 === "err") return envV2;
  return serverV2;
}
