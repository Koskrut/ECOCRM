"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getCart, getMe } from "@/lib/api";
import { getCartSessionId } from "@/lib/cart-session";

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

function CartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export function NavBar() {
  const [cartSummary, setCartSummary] = useState<{ count: number; sumUah: number } | null>(null);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const accountDropdownRef = useRef<HTMLDivElement>(null);

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
    if (!accountDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(e.target as Node)) {
        setAccountDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [accountDropdownOpen]);

  const cartCount = cartSummary?.count ?? 0;
  const cartSumUah = cartSummary?.sumUah ?? 0;

  return (
    <nav
      className="hidden border-b border-[var(--border)] bg-white md:block"
      aria-label="Головне меню"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-6">
          {navLinks.slice(0, -1).map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-[40px] items-center text-sm text-zinc-600 hover:text-[var(--primary)] transition"
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-6">
          <Link
            href="/cart"
            className="flex min-h-[40px] items-center gap-1.5 text-sm text-zinc-600 hover:text-[var(--primary)] transition"
          >
            <CartIcon className="h-4 w-4 shrink-0" />
            <span>
              Кошик
              {(cartCount > 0 || cartSumUah > 0) && (
                <> ({cartCount}) · {cartSumUah} грн</>
              )}
            </span>
          </Link>
          <div className="relative" ref={accountDropdownRef}>
            <button
              type="button"
              onClick={() => setAccountDropdownOpen((v) => !v)}
              className="flex min-h-[40px] items-center gap-1 text-sm text-zinc-600 hover:text-[var(--primary)] transition"
              aria-expanded={accountDropdownOpen}
              aria-haspopup="true"
              aria-label="Акаунт"
            >
              Акаунт
              <ChevronDownIcon className={`h-4 w-4 shrink-0 transition ${accountDropdownOpen ? "rotate-180" : ""}`} />
            </button>
            {accountDropdownOpen && (
              <div
                className="absolute right-0 top-full z-10 mt-1 min-w-[160px] rounded-lg border border-[var(--border)] bg-white py-1 shadow-lg"
                role="menu"
              >
                {(loggedIn === true ? accountLinks.filter((l) => l.href === "/cabinet") : accountLinks).map(
                  ({ href, label, prefetch }) => (
                    <Link
                      key={href}
                      href={href}
                      prefetch={prefetch ?? true}
                      role="menuitem"
                      onClick={() => setAccountDropdownOpen(false)}
                      className="block px-4 py-2.5 text-sm text-zinc-700 hover:bg-[var(--surface)] hover:text-[var(--primary)] transition"
                    >
                      {label}
                    </Link>
                  ),
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
