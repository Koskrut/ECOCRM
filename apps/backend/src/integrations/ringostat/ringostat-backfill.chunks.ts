/** Default: 2 days per request — keeps responses bounded vs Ringostat limits. */
export const DEFAULT_RINGOSTAT_BACKFILL_CHUNK_MS = 2 * 24 * 60 * 60 * 1000;

/** Overlap between chunks so calls on boundaries are not dropped. */
export const DEFAULT_RINGOSTAT_BACKFILL_OVERLAP_MS = 15 * 60 * 1000;

const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

export type RingostatBackfillChunkRunnerOptions = {
  chunkMs?: number;
  overlapMs?: number;
  fetchChunk: (from: Date, to: Date) => Promise<unknown[]>;
  ingestEvents: (events: unknown[]) => Promise<void>;
};

/**
 * Walks [fromInclusive, toInclusive) in UTC-aligned windows with backward overlap
 * (except the first chunk). Re-fetching the same call is safe: Call upsert is idempotent.
 */
export async function runRingostatBackfillChunks(
  fromInclusive: Date,
  toInclusive: Date,
  options: RingostatBackfillChunkRunnerOptions,
): Promise<{ chunks: number; totalEvents: number }> {
  const chunkMs = options.chunkMs ?? DEFAULT_RINGOSTAT_BACKFILL_CHUNK_MS;
  const overlapMs = options.overlapMs ?? DEFAULT_RINGOSTAT_BACKFILL_OVERLAP_MS;

  const t0 = fromInclusive.getTime();
  const t1 = toInclusive.getTime();
  if (!(t0 < t1)) {
    throw new Error("from must be strictly before to");
  }
  if (t1 - t0 > MAX_RANGE_MS) {
    throw new Error("Range must not exceed 366 days");
  }

  let chunks = 0;
  let totalEvents = 0;
  let windowStart = fromInclusive;

  while (windowStart.getTime() < t1) {
    const rawEndMs = Math.min(windowStart.getTime() + chunkMs, t1);
    const rawEnd = new Date(rawEndMs);

    const isFirst = windowStart.getTime() === fromInclusive.getTime();
    const fetchFrom = isFirst
      ? windowStart
      : new Date(Math.max(windowStart.getTime() - overlapMs, t0));
    const fetchTo = rawEnd;

    const events = await options.fetchChunk(fetchFrom, fetchTo);
    chunks += 1;
    totalEvents += events.length;
    if (events.length > 0) {
      await options.ingestEvents(events);
    }

    windowStart = rawEnd;
  }

  return { chunks, totalEvents };
}
