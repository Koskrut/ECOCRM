"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { STORE_CATEGORIES } from "@/lib/categories";

const row =
  "flex touch-pan-x snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
const pill =
  "inline-flex shrink-0 snap-start items-center rounded-full border px-3 py-1.5 text-xs font-medium transition whitespace-nowrap sm:text-sm";
const idle =
  "border-[var(--border)] bg-white text-zinc-700 hover:border-[var(--primary)] hover:bg-[var(--surface)]";
const active = "border-[var(--primary)] bg-[var(--primary)] text-white shadow-sm";

/**
 * Mobile/tablet: always-visible product groups (SKU prefix). Sidebar CategoryNav is lg+ only.
 */
export function CategoryQuickStrip() {
  const searchParams = useSearchParams();
  const search = searchParams.get("search");
  const category = searchParams.get("category");

  const buildHref = (groupId: string) => {
    const q = new URLSearchParams();
    if (search) q.set("search", search);
    q.set("category", groupId);
    const s = q.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <nav
      className="mb-4 min-w-0 lg:hidden"
      aria-label="Категорії каталогу"
    >
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Системи</p>
      <div className={row} role="list">
        {STORE_CATEGORIES.map((cat) => {
          const isActive = category === cat.id;
          return (
            <Link
              key={cat.id}
              href={buildHref(cat.id)}
              scroll={false}
              role="listitem"
              className={`${pill} ${isActive ? active : idle}`}
            >
              {cat.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
