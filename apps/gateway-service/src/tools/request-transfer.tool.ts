export function transferToolPayload(requested: boolean, reason?: string): Record<string, unknown> {
  return { transferRequested: requested, ...(reason ? { reason } : {}) };
}
