import { sanitizeMetaError } from "./meta-audience.normalize";
import { buildAudienceSegments, type AudienceSource } from "./meta-audience.segments";
import {
  AUDIENCE_CATALOG,
  AUDIENCE_KEYS,
  SMALL_AUDIENCE_LIMIT,
  type StoredMetaAudiences,
} from "./meta-audience.types";
import type { MetaAudienceGraph } from "./meta-audience.graph";

export async function executeMetaAudienceSync(input: {
  stored: StoredMetaAudiences;
  source: Omit<AudienceSource, "lapsedDays" | "seedWindowDays">;
  version: string;
  graph: MetaAudienceGraph;
  persist: (next: StoredMetaAudiences) => Promise<void>;
}): Promise<StoredMetaAudiences> {
  const stored: StoredMetaAudiences = {
    ...input.stored,
    audiences: {
      buyers_12m: { ...input.stored.audiences.buyers_12m },
      buyers_all: { ...input.stored.audiences.buyers_all },
      buyers_lapsed: { ...input.stored.audiences.buyers_lapsed },
      leads_no_order: { ...input.stored.audiences.leads_no_order },
    },
  };
  const built = buildAudienceSegments({
    ...input.source,
    lapsedDays: stored.lapsedDays,
    seedWindowDays: stored.seedWindowDays,
  });

  for (const key of AUDIENCE_KEYS) {
    const state = stored.audiences[key];
    const people = built[key].people;
    const catalog = AUDIENCE_CATALOG[key];
    try {
      if (!state.audienceId) {
        state.audienceId = await input.graph.createAudience({
          adAccountId: stored.adAccountId || "",
          accessToken: stored.accessToken || "",
          version: input.version,
          name: catalog.name,
          description: catalog.description,
          valueBased: catalog.valueBased,
        });
        await input.persist(stored);
      }
      state.crmCount = people.length;
      state.syncedAt = input.source.now.toISOString();
      state.error = null;
      if (people.length === 0) {
        state.status = "empty";
        state.warning = null;
        await input.persist(stored);
        continue;
      }
      state.metaReceived = await input.graph.replaceUsers({
        audienceId: state.audienceId,
        accessToken: stored.accessToken || "",
        version: input.version,
        people,
        valueBased: catalog.valueBased,
      });
      state.status = "ok";
      state.warning = people.length < SMALL_AUDIENCE_LIMIT ? "small" : null;
      await input.persist(stored);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.status = "error";
      state.crmCount = people.length;
      state.error = sanitizeMetaError(message, stored.accessToken);
      state.warning = null;
      state.syncedAt = input.source.now.toISOString();
      await input.persist(stored);
    }
  }
  return stored;
}
