import { Redirect } from "expo-router";

import { formatLocalDateKey } from "@/lib/date";

/** Canonical map lives at /map/[date]; keep /map as a stable entry that does not clash with tabs. */
export default function MapIndexRedirect() {
  return <Redirect href={`/map/${formatLocalDateKey()}`} />;
}
