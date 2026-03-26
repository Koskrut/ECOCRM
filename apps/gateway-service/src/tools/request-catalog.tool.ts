export function catalogToolPayload(requested: boolean): Record<string, unknown> {
  return { catalogRequested: requested };
}
