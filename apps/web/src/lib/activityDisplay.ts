const CALL_STATUS_UA: Record<string, string> = {
  ANSWERED: "Відповіли",
  MISSED: "Пропущено",
  NOANSWER: "Немає відповіді",
  NO_ANSWER: "Немає відповіді",
  BUSY: "Зайнято",
  FAILED: "Помилка",
  PROPER: "Відповіли",
};

function translateCallStatus(raw: string): string {
  const key = raw.trim().toUpperCase();
  if (CALL_STATUS_UA[key]) return CALL_STATUS_UA[key];
  if (key.includes("MISSED") || key.includes("NO_ANSWER") || key.includes("NOANSWER")) {
    return "Пропущено";
  }
  if (key.includes("ANSWER")) return "Відповіли";
  return raw;
}

/** Localize legacy Ringostat activity title/body (RU labels + EN status codes). */
export function localizeCallActivityText(text: string): string {
  if (!text.trim()) return text;

  let out = text
    .replace(/Статус:\s*([^·]+)/gi, (_, status: string) => `Статус: ${translateCallStatus(status)}`)
    .replace(/Направление:/g, "Напрямок:")
    .replace(/входящий/gi, "вхідний")
    .replace(/исходящий/gi, "вихідний")
    .replace(/Длительность:/g, "Тривалість:")
    .replace(/Запись:/g, "Запис:")
    .replace(/доступна/gi, "доступний")
    .replace(/^Звонок\b/gi, "Дзвінок");

  return out;
}
