import { createHash } from "node:crypto";

/** Parts/packaging live outside the sales catalog (Product.kind=PART, showOnStore=false). */

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
