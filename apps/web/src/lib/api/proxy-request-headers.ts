import "server-only";

/** Remove hop-by-hop and client-specific headers before forwarding to the API. */
export function stripProxyRequestHeaders(headers: Headers): void {
  headers.delete("host");
  headers.delete("origin");
  headers.delete("referer");
  headers.delete("connection");
  headers.delete("upgrade");
  headers.delete("transfer-encoding");
  headers.delete("content-length");
  headers.delete("if-none-match");
  headers.delete("if-modified-since");
}
