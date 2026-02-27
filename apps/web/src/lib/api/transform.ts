export function unwrap<T>(data: unknown): T {
  if (data && typeof data === "object" && "ok" in data) {
    const d = data as { ok: unknown } & Record<string, unknown>;
    if (d.ok === true) {
      const { ok: _ok, ...rest } = d;
      return rest as unknown as T;
    }
  }
  return data as T;
}
