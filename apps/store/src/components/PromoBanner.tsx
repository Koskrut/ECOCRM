import Link from "next/link";

export function PromoBanner() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[var(--primary)] to-[#2d5a87] px-8 py-14 text-center shadow-xl sm:px-16 sm:py-20">
        <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Широкий вибір компонентів
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-blue-100">
          Якісні комплектуючі та зручне оформлення замовлення. Доставка по всій Україні.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/?category=00"
            className="rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-[var(--primary)] shadow-sm transition hover:bg-gray-50"
          >
            Перейти в каталог
          </Link>
        </div>
      </div>
    </section>
  );
}
