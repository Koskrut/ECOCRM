import { Suspense } from "react";
import LeadThankYouClient from "./LeadThankYouClient";

export default function LeadThankYouPage() {
  return (
    <Suspense fallback={null}>
      <LeadThankYouClient />
    </Suspense>
  );
}
