"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { formatDateTimeNumeric, todayYmdInKyiv, ymdDaysAgoInKyiv } from "@/lib/crmDatetime";
import { callsApi, type CallsHistoryItem } from "@/lib/api/resources/calls";
import type { ManualCallOutcome } from "@/lib/api/resources/manual-calling";

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

const OUTCOME_LABEL = Object.fromEntries(OUTCOMES.map((o) => [o.value, o.label])) as Record<
  ManualCallOutcome,
  string
>;

const DIR_UA: Record<string, string> = {
  INBOUND: "Вхідний",
  OUTBOUND: "Вихідний",
  UNKNOWN: "Невідомо",
};

type MeUser = { role?: string };
type UserRow = { id: string; fullName: string; email: string; role: string };

const PAGE_SIZE = 25;

function statusLabel(status: string | null, direction: string | null): string {
  const s = (status ?? "").toUpperCase();
  const d = (direction ?? "").toUpperCase();
  if (!s) return "—";
  if (s.includes("MISSED") || s === "NOANSWER" || s.includes("NO_ANSWER")) {
    return d === "OUTBOUND" ? "Не дозвонився" : "Пропущений";
  }
  if (s.includes("ANSWER") || s === "ANSWERED" || s === "PROPER") return "Відповіли";
  if (s === "BUSY") return "Зайнято";
  if (s === "FAILED") return "Помилка";
  return s;
}

function formatSeconds(sec: number | null): string | null {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return null;
  if (sec < 60) return `${sec} с`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m} хв ${String(s).padStart(2, "0")} с`;
}

function Badge({
  children,
  tone = "neutral",
  title,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "info";
  title?: string;
}) {
  const cls =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : tone === "bad"
          ? "border-red-200 bg-red-50 text-red-700"
          : tone === "info"
            ? "border-sky-200 bg-sky-50 text-sky-700"
            : "border-zinc-200 bg-zinc-100 text-zinc-700";
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {children}
    </span>
  );
}

function rowTime(row: CallsHistoryItem): string | null {
  if (row.rowKind === "MANUAL_ORPHAN") {
    return row.manualCompletedAt ?? row.sortAt;
  }
  return row.startedAt ?? row.sortAt;
}

function sourceLabel(row: CallsHistoryItem): string {
  if (row.rowKind === "MANUAL_ORPHAN") {
    return "Прозвін (без АТС)";
  }
  if (row.provider === "RINGOSTAT") return "Ringostat";
  return row.provider ?? "Телефонія";
}

export default function CallsHistoryPage() {
  const [role, setRole] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userId, setUserId] = useState("");
  const [outcome, setOutcome] = useState<"" | ManualCallOutcome>("");
  const [from, setFrom] = useState(() => ymdDaysAgoInKyiv(30));
  const [to, setTo] = useState(() => todayYmdInKyiv());
  const [recording, setRecording] = useState<"any" | "yes" | "no">("any");
  const [direction, setDirection] = useState<"" | "INBOUND" | "OUTBOUND" | "UNKNOWN">("");
  const [manualOnly, setManualOnly] = useState(false);
  const [provider, setProvider] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<CallsHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiHttp
      .get<{ user?: MeUser }>("/auth/me")
      .then((r) => setRole(r.data?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  useEffect(() => {
    if (role !== "ADMIN" && role !== "LEAD") return;
    apiHttp
      .get<{ items?: UserRow[] }>("/users")
      .then((r) => setUsers(r.data?.items ?? []))
      .catch(() => setUsers([]));
  }, [role]);

  const searchDebounceSkip = useRef(true);
  useEffect(() => {
    if (searchDebounceSkip.current) {
      searchDebounceSkip.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      setQ(qInput);
      setPage(1);
    }, 400);
    return () => window.clearTimeout(t);
  }, [qInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await callsApi.listHistory({
        page,
        pageSize: PAGE_SIZE,
        from: from ? `${from}T00:00:00.000Z` : undefined,
        to: to ? `${to}T23:59:59.999Z` : undefined,
        outcome: outcome || undefined,
        recording: recording === "any" ? undefined : recording,
        direction: direction || undefined,
        manualOnly: manualOnly ? true : undefined,
        provider: provider.trim() || undefined,
        userId: userId || undefined,
        q: q.trim() || undefined,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не вдалося завантажити");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, from, to, outcome, recording, direction, manualOnly, provider, userId, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const showUserFilter = role === "ADMIN" || role === "LEAD";
  const showManagerCol = showUserFilter;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Історія дзвінків</h1>
          <p className="text-sm text-zinc-500">
            Вхідні та вихідні, Ringostat і результати прозвону
          </p>
        </div>
        <Link href="/work/calls" className="text-sm font-medium text-blue-600 hover:underline">
          ← До черги
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div>
          <label className="block text-xs font-medium text-zinc-600">З</label>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setPage(1);
              setFrom(e.target.value);
            }}
            className="mt-0.5 rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600">По</label>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setPage(1);
              setTo(e.target.value);
            }}
            className="mt-0.5 rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600">Напрямок</label>
          <select
            value={direction}
            onChange={(e) => {
              setPage(1);
              setDirection(e.target.value as "" | "INBOUND" | "OUTBOUND" | "UNKNOWN");
            }}
            className="mt-0.5 min-w-[140px] rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
          >
            <option value="">Усі</option>
            <option value="INBOUND">Вхідний</option>
            <option value="OUTBOUND">Вихідний</option>
            <option value="UNKNOWN">Невідомо</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600">Провайдер</label>
          <select
            value={provider}
            onChange={(e) => {
              setPage(1);
              setProvider(e.target.value);
            }}
            className="mt-0.5 min-w-[140px] rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
          >
            <option value="">Усі</option>
            <option value="RINGOSTAT">Ringostat</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600">Результат прозвону</label>
          <select
            value={outcome}
            onChange={(e) => {
              setPage(1);
              setOutcome(e.target.value as "" | ManualCallOutcome);
            }}
            className="mt-0.5 min-w-[180px] rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
          >
            <option value="">Усі</option>
            {OUTCOMES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600">Запис</label>
          <select
            value={recording}
            onChange={(e) => {
              setPage(1);
              setRecording(e.target.value as "any" | "yes" | "no");
            }}
            className="mt-0.5 min-w-[140px] rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
          >
            <option value="any">Неважливо</option>
            <option value="yes">Є запис</option>
            <option value="no">Без запису</option>
          </select>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={manualOnly}
            onChange={(e) => {
              setPage(1);
              setManualOnly(e.target.checked);
            }}
            className="rounded border-zinc-300"
          />
          Лише з прозвону
        </label>
        <div className="min-w-[200px] flex-1">
          <label className="block text-xs font-medium text-zinc-600">Пошук (телефон / імʼя)</label>
          <input
            type="search"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="380…"
            className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
          />
        </div>
        {showUserFilter ? (
          <div>
            <label className="block text-xs font-medium text-zinc-600">Менеджер (на лінії)</label>
            <select
              value={userId}
              onChange={(e) => {
                setPage(1);
                setUserId(e.target.value);
              }}
              className="mt-0.5 min-w-[200px] rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
            >
              <option value="">Усі</option>
              {users
                .filter((u) => u.role === "MANAGER" || u.role === "USER" || u.role === "LEAD")
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName || u.email}
                  </option>
                ))}
            </select>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {loading ? "…" : "Оновити"}
        </button>
      </div>

      {err ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2">Час</th>
                <th className="px-3 py-2">Джерело</th>
                <th className="px-3 py-2">Напрямок</th>
                {showManagerCol ? <th className="px-3 py-2">Менеджер</th> : null}
                <th className="px-3 py-2">Контакт</th>
                <th className="px-3 py-2">Статус АТС</th>
                <th className="px-3 py-2">Результат прозвону</th>
                <th className="px-3 py-2">Тривалість</th>
                <th className="px-3 py-2">Запис</th>
                <th className="px-3 py-2">Примітка</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={showManagerCol ? 10 : 9}
                    className="px-3 py-10 text-center text-zinc-500"
                  >
                    {loading ? "Завантаження…" : "Немає записів за фільтрами"}
                  </td>
                </tr>
              ) : (
                items.map((row) => {
                  const t = rowTime(row);
                  const displayManager =
                    row.rowKind === "CALL" ? row.manager : row.manualUser ?? row.manager;
                  const isOutbound = (row.direction ?? "").toUpperCase() === "OUTBOUND";
                  const a = isOutbound ? row.toDisplay : row.fromDisplay;
                  const b = isOutbound ? row.fromDisplay : row.toDisplay;
                  const managerLinePhone =
                    row.rowKind === "CALL" ? row.toDisplay : (displayManager ? row.toDisplay : null);
                  const recStatus = (row.recordingStatus ?? "").toUpperCase();
                  const recTone =
                    recStatus === "READY"
                      ? "good"
                      : recStatus === "PENDING"
                        ? "warn"
                        : recStatus === "FAILED"
                          ? "bad"
                          : "neutral";
                  return (
                    <tr key={`${row.rowKind}-${row.id}`} className="border-b border-zinc-100 last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 text-zinc-600">
                        {t ? formatDateTimeNumeric(t) : "—"}
                      </td>
                      <td className="px-3 py-2 text-zinc-800">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span>{sourceLabel(row)}</span>
                          {row.direction ? (
                            <Badge tone={row.direction === "OUTBOUND" ? "info" : "good"}>
                              {row.direction === "OUTBOUND" ? "OUT" : row.direction === "INBOUND" ? "IN" : row.direction}
                            </Badge>
                          ) : null}
                          {row.provider ? <Badge>{row.provider}</Badge> : null}
                          {recStatus ? (
                            <Badge tone={recTone} title="Статус запису">
                              REC {recStatus}
                            </Badge>
                          ) : (
                            <Badge tone="neutral" title="Статус запису">REC —</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-zinc-700">
                        {row.direction ? DIR_UA[row.direction] ?? row.direction : "—"}
                      </td>
                      {showManagerCol ? (
                        <td className="px-3 py-2 text-zinc-700">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate">{displayManager?.fullName ?? "—"}</span>
                            {row.rowKind === "CALL" && row.isInternalCall ? (
                              <Badge tone="info" title="Внутренний звонок (менеджер ↔ менеджер)">
                                INTERNAL
                              </Badge>
                            ) : null}
                          </div>
                          {row.rowKind === "CALL" ? (
                            <div
                              className="mt-0.5 text-[11px] text-zinc-400 font-mono truncate"
                              title={managerLinePhone ?? ""}
                            >
                              {managerLinePhone ?? "—"}
                            </div>
                          ) : null}
                        </td>
                      ) : null}
                      <td className="max-w-[240px] px-3 py-2">
                        <div className="font-medium text-zinc-900 truncate" title={row.target?.displayName ?? ""}>
                          {row.target?.displayName ?? "—"}
                        </div>
                        <div
                          className="text-xs text-zinc-500 font-mono truncate"
                          title={row.target?.phone ?? row.toDisplay ?? row.fromDisplay ?? ""}
                        >
                          {row.target?.phone ?? row.toDisplay ?? row.fromDisplay ?? "—"}
                        </div>
                        {a && b && a !== b ? (
                          <div className="mt-0.5 text-[11px] text-zinc-400 font-mono truncate" title={`${a} → ${b}`}>
                            {a} <span className="mx-1">→</span> {b}
                          </div>
                        ) : null}
                        {row.target?.kind === "LEAD" ? (
                          <Link
                            href={`/leads?leadId=${row.target.id}`}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Лід
                          </Link>
                        ) : row.target?.kind === "CONTACT" ? (
                          <Link
                            href={`/contacts?contactId=${row.target.id}`}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Контакт
                          </Link>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-zinc-700">{statusLabel(row.status, row.direction)}</td>
                      <td className="px-3 py-2 text-zinc-800">
                        {row.manualOutcome
                          ? OUTCOME_LABEL[row.manualOutcome] ?? row.manualOutcome
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-zinc-600">
                        {(() => {
                          const talk = row.talkSec ?? null;
                          const wait = row.waitingSec ?? null;
                          const total = row.durationSec ?? null;
                          const talkText = formatSeconds(talk);
                          const waitText = formatSeconds(wait);
                          const totalText = formatSeconds(total);
                          if (!talkText && !totalText) return "—";
                          return (
                            <div className="leading-tight">
                              <div>{talkText ?? totalText}</div>
                              {(waitText || totalText) && (talkText || waitText) ? (
                                <div className="text-[11px] text-zinc-400">
                                  {waitText ? `очікування ${waitText}` : null}
                                  {waitText && totalText ? " · " : null}
                                  {totalText ? `всього ${totalText}` : null}
                                </div>
                              ) : null}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="max-w-[280px] px-3 py-2">
                        {row.recordingUrl ? (
                          <audio controls className="h-8 w-full max-w-[260px]" src={row.recordingUrl} />
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td
                        className="max-w-xs truncate px-3 py-2 text-zinc-600"
                        title={row.manualNote ?? ""}
                      >
                        {row.manualNote ?? "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {total > PAGE_SIZE ? (
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-zinc-600">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 disabled:opacity-50"
          >
            Назад
          </button>
          <span>
            Стор. {page} · усього {total}
          </span>
          <button
            type="button"
            disabled={page * PAGE_SIZE >= total || loading}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 disabled:opacity-50"
          >
            Далі
          </button>
        </div>
      ) : null}
    </div>
  );
}
