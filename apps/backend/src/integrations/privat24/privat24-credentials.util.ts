const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function mergePrivat24Credentials(
  existing: Record<string, unknown>,
  dto: { clientId?: string; token?: string; id?: string },
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...existing };
  const dtoHasClientId = Object.prototype.hasOwnProperty.call(dto, "clientId");
  const dtoHasId = Object.prototype.hasOwnProperty.call(dto, "id");
  const existingClientId = typeof existing.clientId === "string" ? existing.clientId : undefined;
  const existingId = typeof existing.id === "string" ? existing.id : undefined;

  if (Object.prototype.hasOwnProperty.call(dto, "clientId")) {
    next.clientId = dto.clientId === "" ? undefined : dto.clientId;
  }
  if (Object.prototype.hasOwnProperty.call(dto, "token")) {
    next.token = dto.token === "" ? undefined : dto.token;
  }
  if (Object.prototype.hasOwnProperty.call(dto, "id")) {
    next.id = dto.id === "" ? undefined : dto.id;
  }

  const staleUuidId = dtoHasClientId && !dtoHasId && typeof next.id === "string" && UUID_RE.test(next.id);
  if (staleUuidId || (dtoHasClientId && !dtoHasId && existingId && existingClientId && existingId === existingClientId)) {
    next.id = undefined;
  }
  return next;
}

export function maskPrivat24Credentials(credentials: Record<string, unknown> | null): {
  clientIdMasked?: string;
  tokenMasked?: string;
  idMasked?: string;
} {
  if (!credentials || typeof credentials !== "object") return {};
  const maskValue = (value: string | undefined) => {
    if (!value || value.length < 4) return value ? "••••" : "";
    return "••••" + value.slice(-4);
  };
  const clientId = typeof credentials.clientId === "string" ? credentials.clientId : undefined;
  const token = typeof credentials.token === "string" ? credentials.token : undefined;
  const groupId = typeof credentials.id === "string" ? credentials.id : undefined;
  return {
    ...(clientId !== undefined && { clientIdMasked: maskValue(clientId) }),
    ...(token !== undefined && { tokenMasked: maskValue(token) }),
    ...(groupId !== undefined && { idMasked: groupId ? maskValue(groupId) : "" }),
  };
}
