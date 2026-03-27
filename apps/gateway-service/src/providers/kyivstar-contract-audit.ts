/**
 * Non-secret JSON shape hints for logs when the Kyivstar/B2B adapter response
 * does not match extractors (no vendor contract is checked in — see runbook).
 */

export function jsonTopLevelKeys(json: unknown, max = 40): string[] {
  if (!json || typeof json !== "object" || Array.isArray(json)) return [];
  return Object.keys(json as Record<string, unknown>).slice(0, max);
}

export function summarizeJsonShape(json: unknown, depth = 0): string {
  if (depth > 4) return "...";
  if (json === null) return "null";
  if (Array.isArray(json)) return `array[len=${json.length}]`;
  if (typeof json !== "object") return typeof json;
  const o = json as Record<string, unknown>;
  const keys = Object.keys(o).slice(0, 12);
  const parts = keys.map((k) => {
    const v = o[k];
    if (v === null) return `${k}:null`;
    if (Array.isArray(v)) return `${k}:[]`;
    if (typeof v === "object") return `${k}:{${summarizeJsonShape(v, depth + 1)}}`;
    if (typeof v === "string") return `${k}:string(${v.length})`;
    return `${k}:${typeof v}`;
  });
  return parts.join(",");
}
