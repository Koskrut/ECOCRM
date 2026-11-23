import Link from "next/link";
import { CATALOG_SYSTEMS } from "@/lib/categories";

type CategoryNavProps = {
  className?: string;
  onNavigate?: () => void;
};

export function CategoryNav({ className, onNavigate }: CategoryNavProps) {
  return (
    <nav className={("rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm " + (className ?? "")).trim()}>
      <h3 className="font-heading mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Категорії
      </h3>
      <ul className="space-y-1">
        {CATALOG_SYSTEMS.map((cat) => (
          <li key={cat.id}>
            <Link
              href={"/systems/" + cat.slug}
              prefetch={false}
              onClick={onNavigate}
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
