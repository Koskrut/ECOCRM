"use client";

import Link from "next/link";
import { Suspense } from "react";
import { Settings } from "lucide-react";
import { MetaInboxPage } from "@/components/inbox/MetaInboxPage";
import { PageLoading } from "@/components/feedback";
import { strings } from "@/locales";

function InboxInstagramContent() {
  const t = strings.metaInbox;
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Link
          href="/settings/meta-messaging"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900"
        >
          <Settings className="h-4 w-4" aria-hidden />
          {t.settingsLink}
        </Link>
      </div>
      <MetaInboxPage
        channel="INSTAGRAM"
        title={t.instagramTitle}
        emptyChannelLabel={t.instagramUnlinked}
      />
    </div>
  );
}

export default function InboxInstagramPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <InboxInstagramContent />
    </Suspense>
  );
}
