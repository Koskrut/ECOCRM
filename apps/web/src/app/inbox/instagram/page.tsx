import { redirectToUnifiedInbox } from "../redirect-to-unified";

export default async function InboxInstagramRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirectToUnifiedInbox("INSTAGRAM", await searchParams);
}
