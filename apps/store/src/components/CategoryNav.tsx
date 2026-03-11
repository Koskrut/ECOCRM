import Link from "next/link";
import { STORE_CATEGORIES } from "@/lib/categories";

export function CategoryNav() {
  return (
    <nav className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm">
      <h3 className="font-heading mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Категорії
      </h3>
      <ul className="space-y-1">
        {STORE_CATEGORIES.map((cat) => (
          <li key={cat.id}>
            <Link
              href={"/?category=" + encodeURIComponent(cat.id)}
              className="flex min-h-[44px] items-center rounded-lg py-2 px-3 text-sm text-zinc-700 hover:bg-[var(--surface)] hover:text-[var(--primary)] transition"
            >
              {cat.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
