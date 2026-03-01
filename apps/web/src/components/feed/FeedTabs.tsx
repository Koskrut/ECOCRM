"use client";

import { useState } from "react";

export type FeedTabId = "activity" | "comment" | "message" | "tasks" | "more";

type FeedTabsProps = {
  /** Content when Activity tab is selected (e.g. timeline) */
  activityContent: React.ReactNode;
  /** Optional content for Comment tab; if omitted, shows "Coming soon" placeholder */
  commentContent?: React.ReactNode;
  /** Optional content for Message tab */
  messageContent?: React.ReactNode;
  /** Optional content for Tasks tab */
  tasksContent?: React.ReactNode;
  /** Optional content for More tab */
  moreContent?: React.ReactNode;
};

const TAB_LABELS: Record<FeedTabId, string> = {
  activity: "Activity",
  comment: "Comment",
  message: "Message",
  tasks: "Tasks",
  more: "More",
};

function Placeholder({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-zinc-200 bg-zinc-50/50 p-4 text-sm text-zinc-500">
      {label} — Coming soon
    </div>
  );
}

/**
 * Activity feed header tabs for entity modal right column (entity modal standard).
 * Tabs: Activity, Comment, Message, Tasks, More. Only Activity is wired initially; others show placeholders unless content is provided.
 */
export function FeedTabs({
  activityContent,
  commentContent,
  messageContent,
  tasksContent,
  moreContent,
}: FeedTabsProps) {
  const [tab, setTab] = useState<FeedTabId>("activity");

  const content =
    tab === "activity"
      ? activityContent
      : tab === "comment"
        ? commentContent ?? <Placeholder label="Comment" />
        : tab === "message"
          ? messageContent ?? <Placeholder label="Message" />
          : tab === "tasks"
            ? tasksContent ?? <Placeholder label="Tasks" />
            : moreContent ?? <Placeholder label="More" />;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap gap-1 border-b border-zinc-200 pb-2">
        {(["activity", "comment", "message", "tasks", "more"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded px-2 py-1 text-sm font-medium ${
              tab === id ? "bg-accent-gradient text-white" : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            {TAB_LABELS[id]}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto pt-3">{content}</div>
    </div>
  );
}
