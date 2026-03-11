"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { register as registerApi } from "@/lib/api";
import { Button } from "@/components/Button";

export default function RegisterPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Паролі не збігаються");
      return;
    }
    if (password.length < 6) {
      setError("Пароль має бути не менше 6 символів");
      return;
    }
    setLoading(true);
    try {
      await registerApi({
        phone: phone.trim(),
        password,
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        email: email.trim() || undefined,
      });
      router.push("/cabinet");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка реєстрації");
      setLoading(false);
    }
  };

  const inputClass =
    "mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2.5 text-zinc-900 outline-none transition focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]";

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-white p-6 shadow-sm">
        <h1 className="font-heading text-xl font-semibold text-zinc-900">
          Реєстрація
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Створіть обліковий запис за номером телефону
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <div>
            <label className="block text-sm font-medium text-zinc-700">Телефон *</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700">Імʼя</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700">Прізвище</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700">Пароль *</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700">Підтвердіть пароль *</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              className={inputClass}
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Реєстрація…" : "Зареєструватися"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-zinc-500">
          Вже є акаунт?{" "}
          <Link href="/login" className="text-[var(--primary)] hover:underline">
            Увійти
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-zinc-500">
          <Link href="/" className="text-[var(--primary)] hover:underline">
            До каталогу
          </Link>
        </p>
      </div>
    </div>
  );
}
