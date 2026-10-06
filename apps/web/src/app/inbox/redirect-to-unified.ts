import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

export function redirectToUnifiedInbox(
  channel: "TELEGRAM" | "INSTAGRAM" | "FACEBOOK",
  searchParams: SearchParams,
): never {
  const params = new URLSearchParams();
  params.set("channel", channel);
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "channel") continue;
    if (typeof value === "string" && value) params.set(key, value);
    else if (Array.isArray(value) && value[0]) params.set(key, value[0]);
  }
  const qs = params.toString();
  redirect(`/inbox${qs ? `?${qs}` : ""}`);
}
