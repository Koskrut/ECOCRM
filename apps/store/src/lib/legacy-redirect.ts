import { systemById } from "@/lib/categories";

/** WooCommerce / legacy query noise. Same list as the store middleware. */
export const JUNK_QUERY_PARAMS = [
  "add-to-cart",
  "per_page",
  "per_row",
  "shop_view",
  "woo_ajax",
  "loop",
] as const;

/**
 * Exact legacy paths only. `/catalog-print` is a live route and must pass through.
 * Returns a path, optionally with a hash. Query string is preserved by the caller.
 */
export function legacyLocation(pathname: string): string | null {
  if (pathname === "/catalog-print" || pathname.startsWith("/catalog-print/")) return null;
  if (pathname === "/shop" || pathname === "/shop/") return "/systems";
  if (pathname === "/catalog" || pathname === "/catalog/") return "/systems";
  if (pathname === "/pricelist" || pathname === "/pricelist/") return "/contacts#lead-price";

  const lower = pathname.toLowerCase();
  if (lower === "/product-category" || lower === "/product-category/") return "/systems";
  const prefix = "/product-category/";
  if (!lower.startsWith(prefix)) return null;

  const segment = (pathname.slice(prefix.length).split("/")[0] ?? "").toLowerCase();
  if (segment === "03-ar-series") return "/systems/megagen-anyridge";
  if (segment === "08-nd-series") return "/systems/neodent";
  return "/systems";
}

function withoutJunk(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of JUNK_QUERY_PARAMS) next.delete(key);
  return next;
}

/**
 * `/?category=02` and `/?category=02&subcategory=...` → the system URL.
 * A search on `/` goes to `/systems`. utm and other non-junk params stay.
 * Returns null when the homepage should render as the showcase.
 */
export function homeQueryRedirect(pathname: string, params: URLSearchParams): string | null {
  if (pathname !== "/") return null;
  const category = params.get("category")?.trim() ?? "";
  const search = params.get("search")?.trim() ?? "";
  if (!category && !search) return null;

  const next = withoutJunk(params);
  next.delete("category");

  let path = "/systems";
  if (category) {
    const system = systemById(category);
    if (system) path = `/systems/${system.slug}`;
    else next.delete("subcategory");
  }

  const qs = next.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Rewrite stored banner/menu hrefs that still point at `/?category=`. */
export function rewriteCatalogHref(href: string): string {
  const trimmed = href.trim();
  if (
    !trimmed ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("tel:")
  ) {
    return href;
  }

  let path = trimmed;
  let search = "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      if (!url.hostname.endsWith("suprex.dental")) return href;
      path = url.pathname || "/";
      search = url.search;
    } catch {
      return href;
    }
  } else {
    const hash = trimmed.indexOf("#");
    const withoutHash = hash >= 0 ? trimmed.slice(0, hash) : trimmed;
    const q = withoutHash.indexOf("?");
    if (q >= 0) {
      path = withoutHash.slice(0, q) || "/";
      search = withoutHash.slice(q);
    } else {
      path = withoutHash || "/";
    }
  }

  if (!path.startsWith("/")) path = `/${path}`;
  const legacy = legacyLocation(path);
  if (legacy) return legacy;
  const home = homeQueryRedirect(path, new URLSearchParams(search.startsWith("?") ? search.slice(1) : search));
  return home ?? href;
}
