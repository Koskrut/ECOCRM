type DiffEntry = {
  field: string;
  before: unknown;
  after: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function areEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function walkDiff(before: unknown, after: unknown, path: string, out: DiffEntry[]): void {
  if (areEqual(before, after)) return;
  if (isObject(before) && isObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      const nextPath = path ? `${path}.${key}` : key;
      walkDiff(before[key], after[key], nextPath, out);
    }
    return;
  }
  out.push({ field: path || "value", before, after });
}

export function computeAuditDiff(before: unknown, after: unknown): DiffEntry[] {
  const out: DiffEntry[] = [];
  walkDiff(before, after, "", out);
  return out;
}
