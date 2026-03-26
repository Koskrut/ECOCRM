export function callbackToolPayload(requested: boolean, window?: string): Record<string, unknown> {
  return { callbackRequested: requested, ...(window ? { window } : {}) };
}
