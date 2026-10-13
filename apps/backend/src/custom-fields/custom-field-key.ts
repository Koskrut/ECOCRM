const UA_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  ґ: "g",
  д: "d",
  е: "e",
  є: "ie",
  ж: "zh",
  з: "z",
  и: "y",
  і: "i",
  ї: "yi",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ь: "",
  ю: "iu",
  я: "ia",
  ы: "y",
  э: "e",
  ё: "e",
  ъ: "",
};

const KEY_RE = /^[a-z][a-z0-9_]*$/;

/** Stable internal key derived from a human label. Never shown as the primary name. */
export function slugCustomFieldKey(label: string, fallback = "field"): string {
  const source = label.trim().toLowerCase();
  let out = "";
  for (const ch of source) {
    if (UA_TO_LATIN[ch] != null) out += UA_TO_LATIN[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else out += "_";
  }
  out = out.replace(/_+/g, "_").replace(/^_+|_+$/g, "").slice(0, 72);
  if (!KEY_RE.test(out)) {
    out = `${fallback}_${out}`.replace(/_+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
  }
  if (!KEY_RE.test(out)) return fallback;
  return out;
}

export function uniqueCustomFieldKey(label: string, used: Set<string>, fallback = "field"): string {
  const base = slugCustomFieldKey(label, fallback);
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) {
    const suffix = `_${n++}`;
    candidate = `${base.slice(0, 80 - suffix.length)}${suffix}`;
  }
  used.add(candidate);
  return candidate;
}

export function optionLabelsFromBody(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const labels: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const text = item.trim();
      if (text) labels.push(text);
    } else if (item && typeof item === "object" && "label" in item) {
      const text = String((item as { label?: unknown }).label ?? "").trim();
      if (text) labels.push(text);
    }
    if (labels.length >= 100) break;
  }
  return labels;
}
