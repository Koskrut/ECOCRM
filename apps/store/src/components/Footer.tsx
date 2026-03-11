"use client";

import Link from "next/link";
import { useStoreConfig } from "@/context/StoreConfigContext";

const DEFAULT_COMPANY = "SUPREX";
const DEFAULT_ADDRESS = "Дніпро, просп. Б. Хмельницкого 147";
const DEFAULT_PHONE = "+380673597488";
const DEFAULT_EMAIL = "[email protected]";

export function Footer() {
  const { config } = useStoreConfig();
  const companyName = config.contact?.companyName || DEFAULT_COMPANY;
  const address = config.contact?.address || DEFAULT_ADDRESS;
  const phone = config.contact?.phone || DEFAULT_PHONE;
  const email = config.contact?.email || DEFAULT_EMAIL;

  return (
    <footer className="mt-auto border-t border-[var(--border)] bg-white safe-area-bottom">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0">
            <span className="font-heading font-bold text-[var(--primary)]">
              {companyName}
            </span>
            <p className="mt-1 text-sm text-zinc-500">
              Стоматологічні компоненти сумісності
            </p>
          </div>
          <div className="text-sm text-zinc-600">
            <p>{address}</p>
            <p className="mt-1">
              <a href={`tel:${phone}`} className="inline-block min-h-[44px] py-2 hover:text-[var(--primary)] transition">
                {phone.replace(/^\+380/, "0")}
              </a>
            </p>
            <p className="mt-1">
              <a href={`mailto:${email}`} className="inline-block min-h-[44px] py-2 hover:text-[var(--primary)] transition">
                {email}
              </a>
            </p>
          </div>
          <nav className="flex flex-wrap gap-4 sm:gap-6 text-sm">
            <Link href="/" className="min-h-[44px] flex items-center text-zinc-600 hover:text-[var(--primary)] transition py-2">
              Каталог
            </Link>
            <Link href="/cart" className="min-h-[44px] flex items-center text-zinc-600 hover:text-[var(--primary)] transition py-2">
              Кошик
            </Link>
            <Link href="/cabinet" prefetch={false} className="min-h-[44px] flex items-center text-zinc-600 hover:text-[var(--primary)] transition py-2">
              Кабінет
            </Link>
          </nav>
        </div>
        <p className="mt-6 border-t border-[var(--border)] pt-6 text-center text-sm text-zinc-500">
          © {new Date().getFullYear()} {companyName}. Всі права захищені.
        </p>
      </div>
    </footer>
  );
}
