"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { trackEvent } from "@/lib/tracking";

export default function LeadThankYouClient() {
  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"882f40"},body:JSON.stringify({sessionId:"882f40",runId:"post-fix",hypothesisId:"H1",location:"apps/store/src/app/lead/thank-you/LeadThankYouClient.tsx:9",message:"LeadThankYouClient render start",data:{phase:"render-start"},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  const params = useSearchParams();
  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"882f40"},body:JSON.stringify({sessionId:"882f40",runId:"post-fix",hypothesisId:"H2",location:"apps/store/src/app/lead/thank-you/LeadThankYouClient.tsx:12",message:"useSearchParams returned object",data:{paramsType:typeof params,paramsExists:Boolean(params)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  const form = params.get("form") ?? "unknown";
  const leadId = params.get("leadId") ?? "";

  useEffect(() => {
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"882f40"},body:JSON.stringify({sessionId:"882f40",runId:"post-fix",hypothesisId:"H3",location:"apps/store/src/app/lead/thank-you/LeadThankYouClient.tsx:18",message:"useEffect fired for thank_you_view",data:{form,leadIdLength:leadId.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    trackEvent("thank_you_view", { formType: form, leadId });
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"882f40"},body:JSON.stringify({sessionId:"882f40",runId:"post-fix",hypothesisId:"H4",location:"apps/store/src/app/lead/thank-you/LeadThankYouClient.tsx:21",message:"trackEvent invoked",data:{eventName:"thank_you_view",formType:form,hasLeadId:Boolean(leadId)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }, [form, leadId]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="rounded-2xl border border-[var(--border)] bg-white p-6 sm:p-8">
        <h1 className="font-heading text-2xl font-semibold text-zinc-900">Дякуємо за звернення</h1>
        <p className="mt-3 text-zinc-600">
          Ми отримали ваш запит і зв&apos;яжемося з вами найближчим часом.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/" className="rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]">
            На головну
          </Link>
          <Link href="/contacts" className="rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-[var(--surface)]">
            Контакти
          </Link>
        </div>
      </div>
    </div>
  );
}
