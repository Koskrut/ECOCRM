export default function ContactsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-heading text-3xl font-semibold text-zinc-900">
        Контакти
      </h1>
      <div className="mt-8 space-y-4 text-zinc-600">
        <p>
          <span className="font-medium text-zinc-700">Адреса:</span>
          <br />
          Дніпро, просп. Б. Хмельницкого 147
        </p>
        <p>
          <span className="font-medium text-zinc-700">Телефон:</span>
          <br />
          <a href="tel:+380673597488" className="text-[var(--primary)] hover:underline">
            067 359 74 88
          </a>
        </p>
        <p>
          <span className="font-medium text-zinc-700">Email:</span>
          <br />
          <a href="mailto:[email protected]" className="text-[var(--primary)] hover:underline">
            [email protected]
          </a>
        </p>
      </div>
    </div>
  );
}
