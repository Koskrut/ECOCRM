"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputClass, ROLE_OPTIONS, submitLead, validateRequiredPhone } from "@/components/forms/lead-form.shared";
import { trackEvent } from "@/lib/tracking";

export function ConsultationForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [roleSegment, setRoleSegment] = useState("clinic");
  const [topic, setTopic] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [started, setStarted] = useState(false);

  const onStart = () => {
    if (started) return;
    setStarted(true);
    trackEvent("form_start", { formType: "consultation_request" });
  };

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const validationError = validateRequiredPhone(phone, email);
        if (validationError) {
          setError(validationError);
          return;
        }
        if (!topic.trim()) {
          setError("Опишіть тему консультації");
          return;
        }
        if (!consent) {
          setError("Потрібна згода на обробку персональних даних");
          return;
        }
        setSubmitting(true);
        try {
          trackEvent("form_submit", { formType: "consultation_request" });
          const result = await submitLead({
            name,
            phone,
            email,
            company,
            roleSegment,
            message: topic,
            formType: "consultation_request",
            consent,
          });
          trackEvent("lead_created", { formType: "consultation_request", leadId: result.leadId });
          router.push(`/lead/thank-you?form=consultation_request&leadId=${encodeURIComponent(result.leadId ?? "")}`);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Помилка надсилання");
          setSubmitting(false);
        }
      }}
    >
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div>
        <label className="text-sm text-zinc-700">Ім&apos;я *</label>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} onFocus={onStart} required />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-sm text-zinc-700">Телефон *</label>
          <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </div>
        <div>
          <label className="text-sm text-zinc-700">Email</label>
          <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="text-sm text-zinc-700">Компанія</label>
        <input className={inputClass} value={company} onChange={(e) => setCompany(e.target.value)} />
      </div>
      <div>
        <label className="text-sm text-zinc-700">Сегмент</label>
        <select className={inputClass} value={roleSegment} onChange={(e) => setRoleSegment(e.target.value)}>
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-sm text-zinc-700">Тема консультації *</label>
        <textarea className={inputClass} rows={4} value={topic} onChange={(e) => setTopic(e.target.value)} required />
      </div>
      <label className="flex items-start gap-2 text-sm text-zinc-700">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
        <span>Погоджуюсь з обробкою персональних даних</span>
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-[var(--primary)] px-4 py-2.5 font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-60"
      >
        {submitting ? "Надсилання..." : "Запросити консультацію"}
      </button>
    </form>
  );
}

