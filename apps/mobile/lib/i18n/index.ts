import { uk, type UkDict } from "./uk";

type Path = string;

function getByPath(obj: Record<string, unknown>, path: Path): string | undefined {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" ? cur : undefined;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    vars[key] != null ? String(vars[key]) : `{${key}}`,
  );
}

export function t(path: Path, vars?: Record<string, string | number>): string {
  const raw = getByPath(uk as unknown as Record<string, unknown>, path);
  if (!raw) return path;
  return interpolate(raw, vars);
}

export function useT() {
  return { t, dict: uk as UkDict };
}

export { uk };
