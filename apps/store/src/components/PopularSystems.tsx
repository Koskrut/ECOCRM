import Link from "next/link";
import { PRODUCT_GROUPS } from "@/lib/categories";

export function PopularSystems() {
  // Taking a selection of popular product systems to feature on the homepage
  const topSystems = PRODUCT_GROUPS.slice(1, 7);

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="flex items-center justify-between mb-8">
        <h2 className="font-heading text-2xl font-semibold text-zinc-900">
          Популярні системи імплантатів
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {topSystems.map((sys) => (
          <Link
            key={sys.id}
            href={`/?category=${sys.id}`}
            className="group flex aspect-square flex-col items-center justify-center rounded-2xl border border-[var(--border)] bg-white p-4 text-center shadow-sm hover:border-[var(--primary)] hover:shadow-md transition"
          >
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--primary)] transition-transform group-hover:scale-110">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-zinc-800">{sys.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
