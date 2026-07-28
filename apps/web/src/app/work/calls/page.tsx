"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ContactTimeline } from "@/app/contacts/ContactTimeline";
import { leadsApi } from "@/lib/api/resources/leads";
import {
  manualCallingApi,
  type ManualCallOutcome,
  type QueueItemResponse,
  type SessionDetail,
} from "@/lib/api/resources/manual-calling";
import { callQueueStatusLabel, callStatusLabel } from "@/lib/status-labels";

const OUTCOMES: { value: ManualCallOutcome; label: string }[] = [
  { value: "NO_ANSWER", label: "Немає відповіді" },
  { value: "BUSY", label: "Зайнято" },
  { value: "WRONG_NUMBER", label: "Невірний номер" },
  { value: "GATEKEEPER", label: "Секретар / відбір" },
  { value: "NOT_INTERESTED", label: "Не цікаво" },
  { value: "INTERESTED", label: "Цікаво" },
  { value: "REQUESTED_OFFER", label: "Запитав КП" },
  { value: "REQUESTED_CALLBACK", label: "Перезвонити" },
  { value: "MEETING_SCHEDULED", label: "Зустріч" },
  { value: "CONVERTED", label: "Конверсія" },
];

function needsCallbackAt(o: ManualCallOutcome) {
  return o === "REQUESTED_CALLBACK" || o === "MEETING_SCHEDULED";
}

function needsNote(o: ManualCallOutcome) {
  return o === "WRONG_NUMBER";
}

export default function CallWorkspacePage() {
  const [queue, setQueue] = useState<QueueItemResponse[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueErr, setQueueErr] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);

  const [playbook, setPlaybook] = useState<{ id: string; title: string; bullets: string[] }[]>([]);

  const [outcome, setOutcome] = useState<ManualCallOutcome>("NO_ANSWER");
  const [note, setNote] = useState("");
  const [callbackAt, setCallbackAt] = useState("");
  const [completeErr, setCompleteErr] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

  const selected = useMemo(
    () => queue.find((q) => q.id === selectedId) ?? null,
    [queue, selectedId],
  );

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    setQueueErr(null);
    try {
      const { items } = await manualCallingApi.getQueue();
      setQueue(items);
      setSelectedId((prev) => {
        if (prev && items.some((i) => i.id === prev)) return prev;
        return items[0]?.id ?? null;
      });
    } catch (e) {
      setQueueErr(e instanceof Error ? e.message : "Не вдалося завантажити чергу");
    } finally {
      setQueueLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    void manualCallingApi.getPlaybook().then((r) => setPlaybook(r.sections));
  }, []);

  const loadSessionForSelection = useCallback(
    async (item: QueueItemResponse | null) => {
      if (!item?.openSessionId) {
        setSession(null);
        return;
      }
      setSessionLoading(true);
      try {
        const { session: s } = await manualCallingApi.getSession(item.openSessionId);
        setSession(s);
      } catch {
        setSession(null);
      } finally {
        setSessionLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!selected) {
      setSession(null);
      return;
    }
    void loadSessionForSelection(selected);
  }, [selected, loadSessionForSelection]);

  const handleClaim = useCallback(async () => {
    if (!selected || selected.status !== "PENDING") return;
    setCompleteErr(null);
    try {
      const { session: s } = await manualCallingApi.claim(selected.id);
      setSession(s);
      await loadQueue();
    } catch (e) {
      setCompleteErr(e instanceof Error ? e.message : "Claim failed");
    }
  }, [selected, loadQueue]);

  const handleSkip = useCallback(async () => {
    if (!selected) return;
    setCompleteErr(null);
    try {
      await manualCallingApi.skip(selected.id);
      setSession(null);
      await loadQueue();
    } catch (e) {
      setCompleteErr(e instanceof Error ? e.message : "Skip failed");
    }
  }, [selected, loadQueue]);

  const handleComplete = useCallback(async () => {
    if (!session || session.status !== "OPEN") return;
    setCompleteErr(null);
    if (needsCallbackAt(outcome) && !callbackAt.trim()) {
      setCompleteErr("Оберіть дату/час для цього результату");
      return;
    }
    if (needsNote(outcome) && !note.trim()) {
      setCompleteErr("Додайте примітку (обовʼязково для «Невірний номер»)");
      return;
    }
    setCompleting(true);
    try {
      const idempotencyKey =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `mc-${Date.now()}`;
      await manualCallingApi.completeSession(session.id, {
        outcome,
        note: note.trim() || undefined,
        callbackAt: needsCallbackAt(outcome) ? new Date(callbackAt).toISOString() : undefined,
        idempotencyKey,
      });
      setNote("");
      setCallbackAt("");
      setOutcome("NO_ANSWER");
      setSession(null);
      await loadQueue();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setCompleteErr(
        typeof msg === "string" ? msg : Array.isArray(msg) ? msg.join(", ") : "Помилка завершення",
      );
    } finally {
      setCompleting(false);
    }
  }, [session, outcome, note, callbackAt, loadQueue]);

  const hotkeyRef = useRef({ claim: handleClaim, skip: handleSkip, complete: handleComplete });
  hotkeyRef.current = { claim: handleClaim, skip: handleSkip, complete: handleComplete };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === "Enter" && e.ctrlKey) {
          e.preventDefault();
          void hotkeyRef.current.complete();
        }
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "n") {
        e.preventDefault();
        void hotkeyRef.current.claim();
      }
      if (k === "s") {
        e.preventDefault();
        void hotkeyRef.current.skip();
      }
      if (k === "c" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        void hotkeyRef.current.complete();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const contextId =
    session?.lead?.id ?? session?.contact?.id ?? session?.company?.id ?? selected?.target?.id ?? null;
  const contextKind = session?.lead
    ? "LEAD"
    : session?.contact
      ? "CONTACT"
      : session?.company
        ? "COMPANY"
        : selected?.target?.kind;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Прозвін (Call Workspace)</h1>
          <p className="text-sm text-zinc-500">
            Гарячі клавіші: <kbd className="rounded bg-zinc-200 px-1">n</kbd> claim,{" "}
            <kbd className="rounded bg-zinc-200 px-1">s</kbd> skip,{" "}
            <kbd className="rounded bg-zinc-200 px-1">c</kbd> завершити
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/work/calls/queue" className="text-sm font-medium text-blue-600 hover:underline">
            Кому дзвонити сьогодні
          </Link>
          <Link href="/work/calls/history" className="text-sm font-medium text-blue-600 hover:underline">
            Усі дзвінки
          </Link>
          <Link href="/leads" className="text-sm font-medium text-blue-600 hover:underline">
            До лідів
          </Link>
        </div>
      </div>

      <div className="grid min-h-[560px] grid-cols-1 gap-3 lg:grid-cols-12">
        {/* Queue */}
        <aside className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm lg:col-span-3">
          <h2 className="mb-2 text-sm font-semibold text-zinc-800">Черга</h2>
          {queueLoading && <p className="text-sm text-zinc-500">Завантаження…</p>}
          {queueErr && <p className="text-sm text-red-600">{queueErr}</p>}
          {!queueLoading && !queue.length && (
            <p className="text-sm text-zinc-500">Черга порожня. Додайте лід зі сторінки лідів.</p>
          )}
          <ul className="space-y-1">
            {queue.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(it.id)}
                  className={`w-full rounded-lg border px-2 py-2 text-left text-sm transition ${
                    it.id === selectedId
                      ? "border-amber-400 bg-amber-50"
                      : "border-zinc-100 hover:bg-zinc-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-900">{it.target?.displayName ?? "—"}</span>
                    {it.source === "MISSED_CALL" && (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-700">
                        Пропущений
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {callQueueStatusLabel(it.status)} · {it.target?.phone ?? "без телефону"}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Context */}
        <section className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm lg:col-span-5">
          <h2 className="mb-2 text-sm font-semibold text-zinc-800">Контекст</h2>
          {!selected && <p className="text-sm text-zinc-500">Оберіть рядок у черзі.</p>}
          {selected && sessionLoading && <p className="text-sm text-zinc-500">Сесія…</p>}
          {selected && !sessionLoading && !session && selected.status === "PENDING" && (
            <div className="space-y-2">
              <p className="text-sm text-zinc-600">
                Натисніть «Взяти в роботу» або <kbd className="rounded bg-zinc-200 px-1">n</kbd>
              </p>
              <button
                type="button"
                onClick={() => void handleClaim()}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Взяти в роботу
              </button>
            </div>
          )}
          {session && contextId && contextKind && (
            <div className="space-y-4">
              <ContextSummary session={session} />
              {contextKind === "LEAD" || contextKind === "CONTACT" ? (
                <div className="max-h-[420px] overflow-y-auto rounded-lg border border-zinc-100">
                  <ContactTimeline
                    apiBaseUrl=""
                    contactId={contextId}
                    entityType={contextKind === "LEAD" ? "lead" : "contact"}
                    showActivityButtons={false}
                  />
                </div>
              ) : (
                <p className="text-sm text-zinc-500">
                  Компанія в черзі прозвона. Відкрийте картку компанії для деталей.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Outcome + playbook */}
        <aside className="flex flex-col gap-3 lg:col-span-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-zinc-800">Результат</h2>
            {completeErr && <p className="mb-2 text-sm text-red-600">{completeErr}</p>}
            {!session || session.status !== "OPEN" ? (
              <p className="text-sm text-zinc-500">Спочатку візьміть елемент черги в роботу.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1">
                  {OUTCOMES.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setOutcome(o.value)}
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        outcome === o.value
                          ? "bg-amber-600 text-white"
                          : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                {needsCallbackAt(outcome) && (
                  <label className="block text-xs font-medium text-zinc-600">
                    Дата / час
                    <input
                      type="datetime-local"
                      value={callbackAt}
                      onChange={(e) => setCallbackAt(e.target.value)}
                      className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                    />
                  </label>
                )}
                <label className="block text-xs font-medium text-zinc-600">
                  Примітка
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                  />
                </label>
                {session.linkedCall && (
                  <p className="text-xs text-emerald-700">
                    Звʼязано з дзвінком Ringostat · {callStatusLabel(session.linkedCall.status)}
                    {session.linkedCall.durationSec != null
                      ? ` · ${session.linkedCall.durationSec}s`
                      : ""}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={completing}
                    onClick={() => void handleComplete()}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    Завершити (c)
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSkip()}
                    className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                  >
                    Пропустити (s)
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-zinc-800">Playbook</h2>
            <div className="max-h-[320px] space-y-3 overflow-y-auto text-sm">
              {playbook.map((sec) => (
                <div key={sec.id}>
                  <p className="font-medium text-zinc-800">{sec.title}</p>
                  <ul className="mt-1 list-inside list-disc text-zinc-600">
                    {sec.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ContextSummary({ session }: { session: SessionDetail }) {
  const [extra, setExtra] = useState<{ line1: string; line2?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (session.lead?.id) {
          const lead = await leadsApi.get(session.lead.id);
          if (!cancelled) {
            setExtra({
              line1: lead.companyName ?? lead.phone ?? "",
              line2: lead.message ?? lead.comment ?? undefined,
            });
          }
        } else if (session.contact) {
          if (!cancelled) {
            setExtra({
              line1: session.contact.company?.name ?? session.contact.phone,
              line2: undefined,
            });
          }
        } else if (session.company) {
          if (!cancelled) {
            setExtra({
              line1: session.company.phone ?? "",
              line2: undefined,
            });
          }
        }
      } catch {
        if (!cancelled) setExtra(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.lead?.id, session.contact?.id, session.company?.id]);

  const name =
    session.lead?.fullName?.trim() ||
    [session.lead?.firstName, session.lead?.lastName].filter(Boolean).join(" ") ||
    [session.contact?.firstName, session.contact?.lastName].filter(Boolean).join(" ") ||
    session.company?.name ||
    "—";

  const phone =
    session.lead?.phone ?? session.contact?.phone ?? session.company?.phone ?? "—";

  return (
    <div className="rounded-lg bg-zinc-50 p-3 text-sm">
      <div className="font-semibold text-zinc-900">{name}</div>
      <div className="flex flex-wrap items-center gap-2 text-zinc-600">
        <span>{phone}</span>
        {phone !== "—" ? (
          <>
            <a href={`tel:${phone}`} className="text-xs text-blue-600 underline">
              tel:
            </a>
          </>
        ) : null}
      </div>
      {extra?.line1 && <div className="mt-1 text-zinc-500">{extra.line1}</div>}
      {extra?.line2 && <div className="text-xs text-zinc-500">{extra.line2}</div>}
      {session.lead && (
        <Link href={`/leads?leadId=${session.lead.id}`} className="mt-2 inline-block text-xs text-blue-600">
          Відкрити лід
        </Link>
      )}
      {session.contact && (
        <Link href={`/contacts?contactId=${session.contact.id}`} className="mt-2 inline-block text-xs text-blue-600">
          Відкрити контакт
        </Link>
      )}
      {session.company && !session.contact && !session.lead && (
        <Link
          href={`/companies?companyId=${session.company.id}`}
          className="mt-2 inline-block text-xs text-blue-600"
        >
          Відкрити компанію
        </Link>
      )}
    </div>
  );
}
