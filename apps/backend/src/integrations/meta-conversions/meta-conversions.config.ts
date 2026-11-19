import { BadRequestException } from "@nestjs/common";
import { maskSecret, metaGraphApiVersion } from "../meta-audiences/meta-audience.normalize";
import {
  BLOCKED_META_PIXEL_IDS,
  DEFAULT_META_PIXEL_ID,
  emptyStoredMetaConversions,
  type PublicMetaConversions,
  type StoredMetaConversions,
} from "./meta-conversions.types";

export type MetaConversionsPatch = {
  pixelId?: string;
  accessToken?: string;
  testEventCode?: string;
  enabled?: boolean;
};

const BLOCKED = new Set<string>(BLOCKED_META_PIXEL_IDS);

export function normalizePixelId(raw: string): string {
  const digits = raw.trim().replace(/\s+/g, "");
  if (BLOCKED.has(digits)) {
    throw new BadRequestException("Цей піксель не підключаємо");
  }
  if (!/^\d{8,20}$/.test(digits)) {
    throw new BadRequestException("Вкажіть номер пікселя цифрами");
  }
  return digits;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseStoredMetaConversions(value: unknown): StoredMetaConversions {
  const empty = emptyStoredMetaConversions();
  if (!value || typeof value !== "object") return empty;
  const row = value as Record<string, unknown>;
  const pixel = asString(row.pixelId);
  let pixelId = empty.pixelId;
  if (pixel && /^\d{8,20}$/.test(pixel) && !BLOCKED.has(pixel)) pixelId = pixel;
  const sent = Array.isArray(row.sentEventIds)
    ? row.sentEventIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(-2000)
    : [];
  return {
    pixelId,
    accessToken: asString(row.accessToken),
    testEventCode: asString(row.testEventCode).slice(0, 64),
    enabled: row.enabled === true,
    lastSuccessAt: asString(row.lastSuccessAt) || null,
    lastEventName: asString(row.lastEventName) || null,
    lastError: asString(row.lastError) || null,
    sentEventIds: sent,
  };
}

export function applyMetaConversionsPatch(stored: StoredMetaConversions, patch: MetaConversionsPatch): StoredMetaConversions {
  const next: StoredMetaConversions = { ...stored, sentEventIds: stored.sentEventIds.slice() };
  if (patch.pixelId !== undefined) {
    const raw = patch.pixelId.trim();
    next.pixelId = raw ? normalizePixelId(raw) : DEFAULT_META_PIXEL_ID;
  }
  if (patch.accessToken !== undefined) {
    const token = patch.accessToken.trim();
    if (token && !token.startsWith("•")) next.accessToken = token;
  }
  if (patch.testEventCode !== undefined) {
    next.testEventCode = patch.testEventCode.trim().slice(0, 64);
  }
  if (patch.enabled !== undefined) next.enabled = patch.enabled === true;
  return next;
}

export function toPublicMetaConversions(stored: StoredMetaConversions): PublicMetaConversions {
  return {
    pixelId: stored.pixelId,
    accessTokenMasked: maskSecret(stored.accessToken),
    testEventCode: stored.testEventCode,
    enabled: stored.enabled,
    graphApiVersion: metaGraphApiVersion(),
    lastSuccessAt: stored.lastSuccessAt,
    lastEventName: stored.lastEventName,
    lastError: stored.lastError,
  };
}
