import type { MetadataRoute } from "next";
import { CATALOG_SYSTEMS } from "@/lib/categories";
import { SITE_URL } from "@/lib/site";
import { fetchSitemapProducts } from "@/lib/store-server-sitemap";

export const dynamic = "force-dynamic";

function entry(
  url: string,
  changeFrequency: "weekly" | "monthly" | "yearly",
  priority: number,
): MetadataRoute.Sitemap[number] {
  return { url, changeFrequency, priority };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    entry(`${SITE_URL}/`, "weekly", 1),
    entry(`${SITE_URL}/systems`, "weekly", 0.9),
    ...CATALOG_SYSTEMS.map((system) => entry(`${SITE_URL}/systems/${system.slug}`, "weekly", 0.8)),
    entry(`${SITE_URL}/about`, "monthly", 0.6),
    entry(`${SITE_URL}/about-production`, "monthly", 0.6),
    entry(`${SITE_URL}/contacts`, "monthly", 0.6),
    entry(`${SITE_URL}/why-suprex`, "monthly", 0.6),
    entry(`${SITE_URL}/privacy-policy`, "yearly", 0.3),
    entry(`${SITE_URL}/cookie-policy`, "yearly", 0.3),
  ];

  const products = await fetchSitemapProducts();
  const productEntries: MetadataRoute.Sitemap = products.map((product) => {
    const item = entry(`${SITE_URL}/product/${encodeURIComponent(product.id)}`, "weekly", 0.7);
    if (!product.updatedAt) return item;
    const updated = new Date(product.updatedAt);
    if (Number.isNaN(updated.getTime())) return item;
    return { ...item, lastModified: updated };
  });

  return [...staticEntries, ...productEntries];
}
