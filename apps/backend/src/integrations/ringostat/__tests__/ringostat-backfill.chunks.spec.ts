import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_RINGOSTAT_BACKFILL_CHUNK_MS,
  DEFAULT_RINGOSTAT_BACKFILL_OVERLAP_MS,
  runRingostatBackfillChunks,
} from "../ringostat-backfill.chunks";

describe("runRingostatBackfillChunks", () => {
  it("rejects when from >= to", async () => {
    const from = new Date("2026-03-01T00:00:00.000Z");
    const to = new Date("2026-03-01T00:00:00.000Z");
    await assert.rejects(
      () =>
        runRingostatBackfillChunks(from, to, {
          fetchChunk: async () => [],
          ingestEvents: async () => {},
        }),
      /from must be strictly before to/,
    );
  });

  it("uses overlap only after the first chunk", async () => {
    const from = new Date("2026-03-01T00:00:00.000Z");
    const to = new Date("2026-03-05T12:00:00.000Z");
    const windows: Array<{ f: string; t: string }> = [];
    const chunkMs = 2 * 24 * 60 * 60 * 1000;
    const overlapMs = 15 * 60 * 1000;

    await runRingostatBackfillChunks(from, to, {
      chunkMs,
      overlapMs,
      fetchChunk: async (f, t) => {
        windows.push({ f: f.toISOString(), t: t.toISOString() });
        return [];
      },
      ingestEvents: async () => {},
    });

    assert.equal(windows.length, 3);
    assert.equal(windows[0].f, "2026-03-01T00:00:00.000Z");
    assert.equal(windows[0].t, "2026-03-03T00:00:00.000Z");

    const secondFrom = new Date(
      new Date("2026-03-03T00:00:00.000Z").getTime() - overlapMs,
    ).toISOString();
    assert.equal(windows[1].f, secondFrom);
    assert.equal(windows[1].t, "2026-03-05T00:00:00.000Z");

    const thirdFrom = new Date(
      new Date("2026-03-05T00:00:00.000Z").getTime() - overlapMs,
    ).toISOString();
    assert.equal(windows[2].f, thirdFrom);
    assert.equal(windows[2].t, "2026-03-05T12:00:00.000Z");
  });

  it("counts events and calls ingest per non-empty chunk", async () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const to = new Date("2026-01-01T01:00:00.000Z");
    let ingested = 0;
    const { chunks, totalEvents } = await runRingostatBackfillChunks(from, to, {
      chunkMs: DEFAULT_RINGOSTAT_BACKFILL_CHUNK_MS,
      overlapMs: DEFAULT_RINGOSTAT_BACKFILL_OVERLAP_MS,
      fetchChunk: async () => [{ id: 1 }],
      ingestEvents: async (ev) => {
        ingested += ev.length;
      },
    });
    assert.equal(chunks, 1);
    assert.equal(totalEvents, 1);
    assert.equal(ingested, 1);
  });
});
