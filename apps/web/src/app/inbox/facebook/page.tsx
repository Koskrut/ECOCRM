import { redirectToUnifiedInbox } from "../redirect-to-unified";

export default async function InboxFacebookRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirectToUnifiedInbox("FACEBOOK", await searchParams);
}
