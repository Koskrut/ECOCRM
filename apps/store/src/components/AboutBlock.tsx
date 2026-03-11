export function AboutBlock() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
      <div className="grid gap-12 lg:grid-cols-2 lg:gap-8 items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            Надійний партнер вашої стоматологічної практики
          </h2>
          <p className="mt-4 text-lg text-zinc-600">
            SUPREX — це виробник високоякісних стоматологічних компонентів сумісності. Ми створюємо надійні титанові платформи, абатменти та інші компоненти, які відповідають найвищим стандартам якості.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4">
            <div className="border-l-2 border-[var(--primary)] pl-4">
              <p className="text-2xl font-bold text-zinc-900">100%</p>
              <p className="text-sm text-zinc-600 mt-1">Сумісність компонентів</p>
            </div>
            <div className="border-l-2 border-[var(--primary)] pl-4">
              <p className="text-2xl font-bold text-zinc-900">Прямі</p>
              <p className="text-sm text-zinc-600 mt-1">Поставки від виробника</p>
            </div>
          </div>
        </div>
        <div className="relative aspect-[4/3] rounded-2xl bg-zinc-100 overflow-hidden shadow-lg">
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-tr from-gray-200 to-gray-50 text-gray-400 font-medium">
            [ Фото продукції або виробництва ]
          </div>
        </div>
      </div>
    </section>
  );
}
