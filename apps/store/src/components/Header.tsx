"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getCart, getMe } from "@/lib/api";
import { getCartSessionId } from "@/lib/cart-session";
import { useStoreConfig } from "@/context/StoreConfigContext";

const DEFAULT_COMPANY = "SUPREX";

const navLinks = [
  { href: "/", label: "Головна" },
  { href: "/#catalog", label: "Магазин" },
  { href: "/about-production", label: "Про виробництво" },
  { href: "/about", label: "Про нас" },
  { href: "/contacts", label: "Контакти" },
  { href: "/cart", label: "Кошик" },
];

const accountLinks = [
  { href: "/login", label: "Вхід", prefetch: false },
  { href: "/register", label: "Реєстрація", prefetch: false },
  { href: "/cabinet", label: "Кабінет", prefetch: false },
];

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function CartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export function Header() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  const { config } = useStoreConfig();
  const companyName = config.contact?.companyName || DEFAULT_COMPANY;
  const [cartSummary, setCartSummary] = useState<{ count: number; sumUah: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    getMe()
      .then(() => setLoggedIn(true))
      .catch(() => setLoggedIn(false));
  }, []);

  useEffect(() => {
    getCart(getCartSessionId())
      .then((c) => setCartSummary({ count: c.items.length, sumUah: Math.round(c.subtotal * (c.uahPerUsd || 41)) }))
      .catch(() => setCartSummary(null));
  }, []);

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
      setTimeout(() => mobileSearchRef.current?.focus(), 100);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchRef.current?.value?.trim();
    if (q) router.push("/?search=" + encodeURIComponent(q));
    else router.push("/");
    setMenuOpen(false);
  };

  const handleMobileSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = mobileSearchRef.current?.value?.trim();
    if (q) router.push("/?search=" + encodeURIComponent(q));
    else router.push("/");
    setMenuOpen(false);
  };

  const initialSearch = searchParams.get("search") ?? "";
  const cartCount = cartSummary?.count ?? 0;
  const cartSumUah = cartSummary?.sumUah ?? 0;

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-white shadow-sm safe-area-top">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4 md:flex-nowrap">
        {/* Mobile menu button — visible only below md */}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-600 hover:bg-[var(--surface)] hover:text-[var(--primary)] transition md:hidden"
          aria-label="Відкрити меню"
        >
          <MenuIcon className="h-6 w-6" />
        </button>

        <Link
          href="/"
          className="min-h-[44px] flex shrink-0 items-center font-heading text-lg font-bold text-[var(--primary)] sm:text-xl"
        >
          {companyName}
        </Link>

        {/* Desktop search — hidden on mobile */}
        <form
          onSubmit={handleSearch}
          className="hidden flex-1 min-w-0 max-w-md md:flex"
        >
          <input
            ref={searchRef}
            type="search"
            name="q"
            defaultValue={initialSearch}
            placeholder="Пошук товара..."
            className="w-full rounded-l-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none transition placeholder:text-zinc-400 focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
          />
          <button
            type="submit"
            className="min-h-[44px] rounded-r-lg bg-[var(--primary)] px-4 py-2.5 text-white hover:bg-[var(--primary-hover)] transition"
            aria-label="Шукати"
          >
            <SearchIcon className="h-5 w-5" />
          </button>
        </form>

        {/* Mobile: cart icon + badge — always visible */}
        <Link
          href="/cart"
          className="relative ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-600 hover:bg-[var(--surface)] hover:text-[var(--primary)] transition md:hidden"
          aria-label={cartCount > 0 ? `Кошик: ${cartCount} товарів, ${cartSumUah} грн` : "Кошик"}
        >
          <CartIcon className="h-6 w-6" />
          {cartCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--primary)] px-1.5 text-xs font-medium text-white">
              {cartCount > 99 ? "99+" : cartCount}
            </span>
          )}
        </Link>
      </div>

      {/* Mobile menu overlay + drawer */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] md:hidden"
            aria-hidden
            onClick={() => setMenuOpen(false)}
          />
          <div
            className="fixed inset-y-0 left-0 z-40 w-full max-w-sm overflow-y-auto bg-white shadow-xl md:hidden safe-area-left"
            role="dialog"
            aria-modal="true"
            aria-label="Меню"
          >
            <div className="flex min-h-[44px] items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <span className="font-heading font-semibold text-[var(--primary)]">Меню</span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-600 hover:bg-[var(--surface)] hover:text-zinc-900 transition"
                aria-label="Закрити меню"
              >
                <CloseIcon className="h-6 w-6" />
              </button>
            </div>
            <div className="p-4 pb-8">
              <form onSubmit={handleMobileSearch} className="mb-6">
                <div className="flex rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                  <input
                    ref={mobileSearchRef}
                    type="search"
                    defaultValue={initialSearch}
                    placeholder="Пошук товара..."
                    className="min-h-[44px] flex-1 bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-zinc-400"
                  />
                  <button
                    type="submit"
                    className="flex h-11 w-11 shrink-0 items-center justify-center bg-[var(--primary)] text-white"
                    aria-label="Шукати"
                  >
                    <SearchIcon className="h-5 w-5" />
                  </button>
                </div>
              </form>
              <nav className="flex flex-col gap-1">
                {navLinks.map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMenuOpen(false)}
                    className="flex min-h-[48px] items-center rounded-lg px-3 text-zinc-700 hover:bg-[var(--surface)] hover:text-[var(--primary)] transition"
                  >
                    {label}
                    {href === "/cart" && (cartCount > 0 || cartSumUah > 0) && (
                      <span className="ml-2 text-sm text-zinc-500">
                        ({cartCount}) · {cartSumUah} грн
                      </span>
                    )}
                  </Link>
                ))}
                {(loggedIn === true ? accountLinks.filter((l) => l.href === "/cabinet") : accountLinks).map(
                  ({ href, label, prefetch }) => (
                    <Link
                      key={href}
                      href={href}
                      prefetch={prefetch ?? true}
                      onClick={() => setMenuOpen(false)}
                      className="flex min-h-[48px] items-center rounded-lg px-3 text-zinc-700 hover:bg-[var(--surface)] hover:text-[var(--primary)] transition"
                    >
                      {label}
                    </Link>
                  ),
                )}
              </nav>
            </div>
          </div>
        </>
      )}
    </header>
  );
}
