import type { TimelineCallMeta, TimelineItem } from "../components/timeline/types";
import { localizeCallActivityText } from "./activityDisplay";
import { looksLikeOpaqueId } from "./changeHistoryDisplay";
import { labelEnum } from "./crmValueLabels";

const TITLE_ALIASES: Record<string, string> = {
  Звонок: "Дзвінок",
  Комментарий: "Коментар",
  Встреча: "Зустріч",
  "Ручной звонок": "Ручний дзвінок",
  CALL: "Дзвінок",
  COMMENT: "Коментар",
  MEETING: "Зустріч",
  MANUAL_CALL: "Ручний дзвінок",
};

export function timelineActorName(name: string | null | undefined): string {
  const value = name?.trim() ?? "";
  if (!value || value === "system") return "Система";
  if (looksLikeOpaqueId(value)) return "Користувач";
  return value;
}

export function timelineTitle(item: TimelineItem): string {
  if (item.kind === "status_change") return "Етап";
  if (item.kind === "shipment") {
    const number = item.meta.kind === "shipment" ? item.meta.data.documentNumber?.trim() : "";
    return number ? `ТТН ${number}` : "Відправлення";
  }
  if (item.kind === "call") return "Дзвінок";
  if (item.kind === "manual_call") return "Ручний дзвінок";
  const raw = item.title?.trim() ?? "";
  if (!raw) {
    if (item.kind === "comment") return "Коментар";
    if (item.kind === "meeting") return "Зустріч";
    if (item.kind === "visit") return "Візит";
    return "Подія";
  }
  return TITLE_ALIASES[raw] ?? raw;
}

export function statusTransition(item: TimelineItem): { from: string; to: string } | null {
  if (item.kind !== "status_change") return null;
  const meta = item.meta.kind === "status" ? item.meta.data : null;
  const fromRaw = meta?.fromStage ?? meta?.fromStatus ?? null;
  const toRaw = meta?.toStage ?? meta?.toStatus ?? null;
  if (!fromRaw && !toRaw) {
    const match = item.title.match(/^(.*?)\s*→\s*(.+)$/);
    if (!match) return null;
    return {
      from: labelEnum(match[1]) ?? match[1].trim(),
      to: labelEnum(match[2]) ?? match[2].trim(),
    };
  }
  return {
    from: (fromRaw ? labelEnum(fromRaw) ?? fromRaw : "—"),
    to: (toRaw ? labelEnum(toRaw) ?? toRaw : "—"),
  };
}

function formatDurationUa(sec?: number): string | null {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null;
  const total = Math.floor(sec);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes === 0) return `${seconds} с`;
  if (seconds === 0) return `${minutes} хв`;
  return `${minutes} хв ${seconds.toString().padStart(2, "0")} с`;
}

function callDirection(direction?: string): string | null {
  const value = (direction ?? "").toUpperCase();
  if (value === "INBOUND" || value === "IN") return "Вхідний";
  if (value === "OUTBOUND" || value === "OUT") return "Вихідний";
  return null;
}

function callStatus(status: string | undefined, direction?: string): string | null {
  const value = (status ?? "").toUpperCase();
  if (!value) return null;
  const outbound = (direction ?? "").toUpperCase() === "OUTBOUND";
  if (value.includes("MISSED") || value === "NOANSWER" || value.includes("NO_ANSWER")) {
    return outbound ? "Не додзвонились" : "Пропущено";
  }
  if (value.includes("ANSWER") || value === "PROPER") return "Відповіли";
  if (value === "BUSY") return "Зайнято";
  if (value === "FAILED") return "Помилка";
  return labelEnum(value) ?? null;
}

function callPhone(meta: TimelineCallMeta): string | null {
  const from = (meta.from ?? "").trim();
  const to = (meta.to ?? "").trim();
  const outbound = (meta.direction ?? "").toUpperCase() === "OUTBOUND";
  const customer = (outbound ? to || from : from || to).trim();
  return customer || null;
}

export function callFacts(item: TimelineItem): string[] {
  if (item.kind !== "call" && item.kind !== "manual_call") return [];
  if (item.meta.kind !== "call") return [];
  const meta = item.meta.data;
  const facts = [
    callDirection(meta.direction),
    callStatus(meta.status, meta.direction),
    formatDurationUa(meta.talkSec ?? meta.durationSec),
    callPhone(meta),
  ];
  return facts.filter((fact): fact is string => Boolean(fact));
}

function isStructuredCallDump(body: string): boolean {
  return /Статус:|Напрямок:|Направление:|Тривалість:|Длительность:|Запис:/.test(body);
}

export function timelineBody(item: TimelineItem): string | null {
  const raw = item.body ?? "";
  const body =
    item.kind === "call" || item.kind === "manual_call" ? localizeCallActivityText(raw) : raw;
  const trimmed = body.trim();
  if (!trimmed) return null;
  if ((item.kind === "call" || item.kind === "manual_call") && isStructuredCallDump(trimmed)) {
    if (callFacts(item).length > 0) return null;
  }
  if (item.kind === "shipment" && item.meta.kind === "shipment") {
    const statusText = item.meta.data.statusText?.trim();
    if (statusText && trimmed === statusText) return null;
  }
  if (item.kind === "status_change" && /^[A-Z0-9_]+(\s*→\s*[A-Z0-9_]+)?$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}
