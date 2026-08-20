import { createHash } from "node:crypto";

/** Parts/packaging live outside the sales catalog (Product.kind=PART, showOnStore=false). */

const PACKAGING_TOKENS = [
  "блистер",
  "blister",
  "этикет",
  "етикет",
  "label",
  "короб",
  "box",
  "инструк",
  "instruction",
  "подлож",
  "tyvek",
  "тайвек",
  "пакет",
  "упаков",
  "sticker",
  "наклей",
  "leaflet",
  "manual",
];

/** True when SKU uses synthetic packaging prefix (`PKG:` or `PKG-`). */
export function isPackagingSkuPrefix(sku: string): boolean {
  const upper = sku.trim().toUpperCase();
  return upper.startsWith("PKG:") || upper.startsWith("PKG-");
}

/** Strip `PKG:` / `PKG-` prefix for slug/name inference. */
export function packagingSkuSuffix(sku: string): string {
  const trimmed = sku.trim();
  const upper = trimmed.toUpperCase();
  if (upper.startsWith("PKG:")) return trimmed.slice(4);
  if (upper.startsWith("PKG-")) return trimmed.slice(4);
  return trimmed;
}

/** Cyrillic / Latin packaging descriptions — not inventoriable metal parts. */
export function looksLikePackagingName(value: string): boolean {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/[«»""'']/g, "")
    .replace(/\s+/g, " ");
  if (!normalized) return false;
  return PACKAGING_TOKENS.some((token) => normalized.includes(token));
}

/**
 * True when a BOM cell value is a real inventoriable article (metal part, screw, platform),
 * not packaging prose like «Блистер Suprex…».
 */
export function looksLikeComponentSku(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (isPackagingSkuPrefix(trimmed)) return false;
  if (looksLikePackagingName(trimmed)) return false;
  if (/^\d+\.\d+$/.test(trimmed)) return true;
  // MG-PF-CAD_CAM-MU, MG-SF-M2.0, ST-RC-AN, OS-TB-LNK-1x6 D4.5, MG-HA 4030, OS-ATS-MU-1 mm
  if (/^[A-Z]{2,}[-/_][A-Z0-9._\s×x/+-]+$/i.test(trimmed)) return true;
  // Space inside article: MG-HA 4030, ST-SF-RA 1
  if (/^[A-Z]{2,}-[A-Z0-9]+(?:\s+[A-Z0-9./+-]+)+$/i.test(trimmed)) return true;
  return false;
}

/** Derive article SKU from a false PKG slug or product name (e.g. PKG:mg-pf-cadcam-mu → MG-PF-CAD_CAM-MU). */
export function inferArticleSkuFromFalsePkg(sku: string, name?: string | null): string | null {
  if (!isPackagingSkuPrefix(sku)) return null;
  const source = (name?.trim() || packagingSkuSuffix(sku).replace(/-/g, " ")).trim();
  if (!source || looksLikePackagingName(source)) return null;
  if (!looksLikeComponentSku(source) && !/^(MG|ND|ST|OS|RC|PF|SF|TB|HA|NC|ATS)/i.test(source)) {
    return null;
  }
  return source.replace(/\s+/g, " ").trim();
}

/**
 * Synthetic packaging SKUs from BOM import (`PKG:блистер-...`).
 * Metal parts mis-imported as PKG:* still constrain capacity (hardening).
 */
export function isNonInventoriedPackagingSku(
  sku: string | null | undefined,
  name?: string | null,
): boolean {
  if (typeof sku !== "string") return false;
  const s = sku.trim();
  if (!isPackagingSkuPrefix(s)) return false;
  const label = name?.trim() || packagingSkuSuffix(s).replace(/-/g, " ");
  if (looksLikeComponentSku(label) && !looksLikePackagingName(label)) {
    return false;
  }
  const inferred = inferArticleSkuFromFalsePkg(s, name);
  if (inferred && looksLikeComponentSku(inferred)) return false;
  return true;
}

/** Prefer inferred metal article over raw `PKG-*` slug in UI/MRP labels. */
export function displayBottleneckSku(sku: string, name?: string | null): string {
  return inferArticleSkuFromFalsePkg(sku, name) ?? sku;
}

/** Whether this BOM component limits kit capacity / packing / MRP explode. */
export function constrainsKitCapacity(component: {
  sku?: string | null;
  name?: string | null;
}): boolean {
  return !isNonInventoriedPackagingSku(component.sku, component.name);
}

export function buildPackagingPartSku(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}.()-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
  if (slug) return `PKG:${slug}`;
  const hash = createHash("sha1").update(name).digest("hex").slice(0, 10);
  return `PKG:unnamed-${hash}`;
}

export function buildArticlePartSku(article: string): string {
  return article.trim();
}

export function buildPartDisplayName(row: {
  componentName: string | null;
  componentSku: string;
  componentSkuRaw: string;
}): string {
  return (row.componentName ?? row.componentSkuRaw ?? row.componentSku).trim();
}

/** Unique SKU if preferred is taken (append short hash of the display name). */
export function uniquifyPartSku(preferredSku: string, displayName: string, taken: Set<string>): string {
  if (!taken.has(preferredSku)) return preferredSku;
  const hash = createHash("sha1").update(displayName).digest("hex").slice(0, 8);
  let candidate = `${preferredSku}#${hash}`;
  let n = 1;
  while (taken.has(candidate)) {
    candidate = `${preferredSku}#${hash}-${n}`;
    n += 1;
  }
  return candidate;
}
