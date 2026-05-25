"use client";

import { useEffect, useState } from "react";
import { contactsApi, type Contact } from "@/lib/api/resources/contacts";
import { normalizePhone } from "@/lib/formatPhone";

function phoneDigitsKey(phone: string | null | undefined): string {
  if (!phone) return "";
  const n = normalizePhone(phone);
  if (n) return n.replace(/\D/g, "");
  return phone.replace(/\D/g, "");
}

function findExactPhoneMatch(items: Contact[], inputPhone: string): Contact | null {
  const key = phoneDigitsKey(inputPhone);
  if (key.length < 9) return null;
  for (const c of items) {
    if (phoneDigitsKey(c.phone) === key) return c;
  }
  return null;
}

export type ContactPhoneDuplicateState = {
  loading: boolean;
  match: Contact | null;
};

export function useContactPhoneDuplicateCheck(phone: string, enabled: boolean): ContactPhoneDuplicateState {
  const [loading, setLoading] = useState(false);
  const [match, setMatch] = useState<Contact | null>(null);

  useEffect(() => {
    if (!enabled) {
      setMatch(null);
      setLoading(false);
      return;
    }

    const digits = phone.replace(/\D/g, "");
    if (digits.length < 9) {
      setMatch(null);
      setLoading(false);
      return;
    }

    const query = normalizePhone(phone) ?? digits;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      contactsApi
        .list({ q: query, pageSize: 5 })
        .then((res) => {
          if (cancelled) return;
          setMatch(findExactPhoneMatch(res.items ?? [], phone));
        })
        .catch(() => {
          if (!cancelled) setMatch(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phone, enabled]);

  return { loading, match };
}
