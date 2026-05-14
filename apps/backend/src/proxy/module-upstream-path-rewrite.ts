/**
 * Path helpers for module upstream proxies. Express strips `app.use(prefix)` from `req.url`
 * before the proxy sees the path; Nest workers still expect the full API path (e.g. `/np/ttn/...`).
 */

export function restorePathAfterExpressMount(mountPrefix: string, pathname: string): string {
  const prefix = mountPrefix.replace(/\/$/, "");
  if (!pathname || pathname === "/") return prefix;
  if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return pathname;
  return `${prefix}${pathname}`;
}

/** Map CRM-facing paths (regex proxy) to in-process Nest routes on the NP worker. */
export function rewriteNovaPoshtaUpstreamPath(pathname: string): string {
  if (pathname.startsWith("/np/")) return pathname;

  const mOrderNp = pathname.match(/^\/orders\/([^/]+)\/np\/ttn(\/.*)?$/);
  if (mOrderNp) {
    const tail = (mOrderNp[2] ?? "").replace(/\/$/, "") || "";
    return `/np/ttn/${mOrderNp[1]}${tail}`;
  }
  const mOrderTtn = pathname.match(/^\/orders\/([^/]+)\/ttn$/);
  if (mOrderTtn) {
    return `/np/ttn/${mOrderTtn[1]}`;
  }
  const mShip = pathname.match(/^\/shipments\/([^/]+)\/np\/ttn(\/.*)?$/);
  if (mShip) {
    const tail = (mShip[2] ?? "").replace(/\/$/, "") || "";
    return `/np/shipment/${mShip[1]}/ttn${tail}`;
  }
  return pathname;
}
