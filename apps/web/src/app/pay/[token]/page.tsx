import { loadPublicPayment } from "./load-public-payment";
import { PayPageClient } from "./PayPageClient";

export const dynamic = "force-dynamic";

export default async function PayPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const { data, error } = await loadPublicPayment(token);
  return <PayPageClient initialData={data} initialError={error} />;
}
