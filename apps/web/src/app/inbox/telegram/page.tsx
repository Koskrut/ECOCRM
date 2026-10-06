import { redirectToUnifiedInbox } from "../redirect-to-unified";

export default async function InboxTelegramRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirectToUnifiedInbox("TELEGRAM", await searchParams);
}
