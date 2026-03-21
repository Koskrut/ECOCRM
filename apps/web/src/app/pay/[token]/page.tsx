import { PayPageClient } from "./PayPageClient";

export default async function PayPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  return <PayPageClient token={token} />;
}
