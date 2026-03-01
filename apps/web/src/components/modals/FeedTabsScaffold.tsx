"use client";

import { useState } from "react";

export type FeedTabKey = "activity" | "comment";

type FeedTabsScaffoldProps = {
  /** Content when Activity tab is selected (e.g. timeline) */
  activityContent: React.ReactNode;
  /** Optional content for Comment tab; if omitted, shows scaffold placeholder (no submit) */
  commentContent?: React.ReactNode;
  /** Optional controlled active tab */
  activeTab?: FeedTabKey;
  onTabChange?: (tab: FeedTabKey) => void;
};

/**
 * Small feed tabs for the right column of entity modals (entity modal standard).
 * Activity | Comment. Use when no comment API: commentContent can be omitted for scaffold-only.
 */
export function FeedTabsScaffold({
  activityContent,
  commentContent,
  activeTab: controlledTab,
  onTabChange,
}: FeedTabsScaffoldProps) {
  const [internalTab, setInternalTab] = useState<FeedTabKey>("activity");
  const tab = controlledTab ?? internalTab;
  const setTab = (t: FeedTabKey) => {
    if (onTabChange) onTabChange(t);
    else setInternalTab(t);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 gap-1 border-b border-zinc-200 pb-2">
        <button
          type="button"
          onClick={() => setTab("activity")}
          className={`rounded px-2 py-1 text-sm font-medium ${
            tab === "activity"
              ? "bg-accent-gradient text-white"
              : "text-zinc-600 hover:bg-zinc-100"
          }`}
        >
          Activity
        </button>
        <button
          type="button"
          onClick={() => setTab("comment")}
          className={`rounded px-2 py-1 text-sm font-medium ${
            tab === "comment"
              ? "bg-accent-gradient text-white"
              : "text-zinc-600 hover:bg-zinc-100"
          }`}
        >
          Comment
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto pt-3">
        {tab === "activity" ? activityContent : commentContent ?? <CommentScaffold />}
      </div>
    </div>
  );
}

function CommentScaffold() {
  return (
    <div className="rounded-md border border-dashed border-zinc-200 bg-zinc-50/50 p-4 text-sm text-zinc-500">
      Comment feed not yet connected. Add a comment API to enable posting.
    </div>
  );
}
