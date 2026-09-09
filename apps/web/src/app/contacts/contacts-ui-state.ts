/** Pure UI decision helpers for Contacts desk (unit-tested). */

export function shouldShowContactsEmpty(opts: {
  loading: boolean;
  error: string | null | undefined;
}): boolean {
  return !opts.loading && !opts.error;
}

/** Drop stale list responses when a newer request has already started. */
export function isCurrentContactsRequest(seq: number, latest: number): boolean {
  return seq === latest;
}

/** Sync filter draft only on closed → open, not on background value updates while open. */
export function shouldInitFilterDraft(open: boolean, wasOpen: boolean): boolean {
  return open && !wasOpen;
}
