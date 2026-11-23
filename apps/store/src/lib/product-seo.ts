import { CATALOG_SYSTEMS, systemBySku, type CatalogSystem } from "@/lib/categories";
import type { Product } from "@/lib/api";

const PART_TYPE_PATTERNS: RegExp[] = [
  /титанов\p{L}*\s+платформ\p{L}*/iu,
  /титанов\p{L}*\s+абатмент\p{L}*/iu,
  /формувач\p{L}*(?:\s+ясен\p{L}*)?/iu,
  /абатмент\p{L}*/iu,
  /платформ\p{L}*/iu,
  /аналог\p{L}*/iu,
  /трансфер\p{L}*/iu,
  /викрутк\p{L}*/iu,
  /гвинт\p{L}*/iu,
  /мультиюніт\p{L}*/iu,
  /multi[-\s]?unit/iu,
  /сканбод\p{L}*/iu,
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function characteristicText(
  characteristics: Record<string, unknown> | null | undefined,
  key: string,
): string {
  const value = characteristics?.[key];
  return typeof value === "string" ? value.trim() : "";
}

/** First part-type phrase found in text, with the original casing and a capital first letter. */
export function partTypeInText(text: string): string | null {
  for (const pattern of PART_TYPE_PATTERNS) {
    const match = text.match(pattern);
    const raw = match?.[0]?.trim();
    if (!raw) continue;
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }
  return null;
}

/**
 * Expand short catalog codes found in card text or compatibility_raw.
 * Does not replace the source string — callers render the result beside it.
 * Returns null when the text already contains the full label.
 */
export function compatibilityReading(raw: string): string | null {
  const text = raw.trim();
  if (!text || text === "—") return null;

  const synonyms = CATALOG_SYSTEMS.flatMap((system) => system.synonyms).sort(
    (a, b) => b.code.length - a.code.length,
  );
  const labels: string[] = [];
  let masked = text;

  for (const synonym of synonyms) {
    const pattern = `(^|[^\\p{L}\\p{N}])(${escapeRegExp(synonym.code)})(?=$|[^\\p{L}\\p{N}])`;
    if (!new RegExp(pattern, "iu").test(masked)) continue;
    if (!labels.some((label) => label.toLowerCase() === synonym.label.toLowerCase())) {
      labels.push(synonym.label);
    }
    masked = masked.replace(new RegExp(pattern, "giu"), "$1 ");
  }

  const extra = labels.filter((label) => !text.toLowerCase().includes(label.toLowerCase()));
  return extra.length > 0 ? extra.join(", ") : null;
}

export function cardCompatibilityLine(name: string, sku: string): string | null {
  const fromName = compatibilityReading(name);
  if (fromName) return fromName;
  const system = systemBySku(sku);
  if (!system) return null;
  if (name.toLowerCase().includes(system.name.toLowerCase())) return null;
  return system.name;
}

function includesPhrase(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function isBareArticle(name: string, sku: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (trimmed.toLowerCase() === sku.trim().toLowerCase()) return true;
  return /^[\d.\-_/A-Za-z]+$/.test(trimmed) && !partTypeInText(trimmed);
}

export function productPartType(product: Pick<Product, "name" | "characteristics">): string | null {
  return (
    partTypeInText(product.name) ??
    partTypeInText(characteristicText(product.characteristics, "category_name")) ??
    partTypeInText(characteristicText(product.characteristics, "subcategory_name"))
  );
}

/** Meta title. A bare article is not used once the name or specs contain a part type. */
export function productMetaTitle(product: Pick<Product, "name" | "sku" | "characteristics">): string {
  const name = product.name.trim();
  const sku = product.sku.trim();
  const system = systemBySku(sku);
  const typeFromName = partTypeInText(name);
  const type = productPartType(product);

  if (typeFromName && !isBareArticle(name, sku)) {
    if (system && !includesPhrase(name, system.name)) return `${name} — ${system.name}`;
    return name;
  }
  if (type && system) return `${type} ${system.name}`;
  if (type) return type;
  if (name && !isBareArticle(name, sku)) {
    if (system && !includesPhrase(name, system.name)) return `${name} — ${system.name}`;
    return name;
  }
  return name || sku;
}

export function productMetaDescription(
  product: Pick<Product, "name" | "sku" | "characteristics" | "inStock">,
  priceUah: number,
): string {
  const type = productPartType(product);
  const system = systemBySku(product.sku);
  const parts: string[] = [];
  if (type) parts.push(type);
  if (system) parts.push(system.name);
  parts.push(`Артикул ${product.sku}`);
  if (priceUah > 0) parts.push(`Ціна ${priceUah} грн`);
  if (priceUah > 0) parts.push(product.inStock ? "В наявності" : "Немає в наявності");
  else parts.push("Наявність уточнюйте");
  parts.push("шт");
  return `${parts.join(". ")}.`;
}

export function productImagePath(primaryImageId: string): string {
  return `/api/products/images/${primaryImageId}/source`;
}

export function buildProductJsonLd({
  id,
  product,
  priceUah,
  siteUrl,
}: {
  id: string;
  product: Product;
  priceUah: number;
  siteUrl: string;
}): Record<string, unknown> {
  const pageUrl = `${siteUrl}/product/${id}`;
  const system: CatalogSystem | undefined = systemBySku(product.sku);
  const productNode: Record<string, unknown> = {
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    brand: { "@type": "Brand", name: "SUPREX" },
  };

  if (product.primaryImageId) {
    productNode.image = [`${siteUrl}${productImagePath(product.primaryImageId)}`];
  }

  if (priceUah > 0) {
    productNode.offers = {
      "@type": "Offer",
      priceCurrency: "UAH",
      price: String(priceUah),
      availability: product.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url: pageUrl,
    };
  }

  const crumbs: Array<Record<string, unknown>> = [
    {
      "@type": "ListItem",
      position: 1,
      name: "Головна",
      item: `${siteUrl}/`,
    },
  ];
  if (system) {
    crumbs.push({
      "@type": "ListItem",
      position: 2,
      name: system.name,
      item: `${siteUrl}/systems/${system.slug}`,
    });
  }
  crumbs.push({
    "@type": "ListItem",
    position: crumbs.length + 1,
    name: product.name,
    item: pageUrl,
  });

  return {
    "@context": "https://schema.org",
    "@graph": [productNode, { "@type": "BreadcrumbList", itemListElement: crumbs }],
  };
}
