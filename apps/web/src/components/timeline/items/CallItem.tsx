"use client";

import { CallCard, type CallTimelineItem } from "@/app/contacts/CallCard";
import type { TimelineItem } from "../types";

type Props = {
  item: TimelineItem;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  showDeleteConfirm?: boolean;
  onConfirmDelete?: () => void;
  onCancelDelete?: () => void;
  actionLoading?: boolean;
};

/** Adapts a canonical TimelineItem (call source) to the legacy CallCard component. */
export function CallItem(props: Props) {
  const adapted = toCallTimelineItem(props.item);
  return (
    <CallCard
      item={adapted}
      isExpanded={props.isExpanded}
      onToggle={props.onToggle}
      onEdit={props.onEdit}
      onDelete={props.onDelete}
      showDeleteConfirm={props.showDeleteConfirm}
      onConfirmDelete={props.onConfirmDelete}
      onCancelDelete={props.onCancelDelete}
      actionLoading={props.actionLoading}
    />
  );
}

function toCallTimelineItem(item: TimelineItem): CallTimelineItem {
  const callMeta = item.meta.kind === "call" ? item.meta.data : undefined;
  return {
    id: item.id,
    type: item.kind === "manual_call" ? "MANUAL_CALL" : "CALL",
    title: item.title,
    body: item.body,
    occurredAt: item.at,
    createdAt: item.createdAt,
    createdBy: item.actor.id ?? "system",
    createdByName: item.actor.name,
    pinnedAt: item.pinnedAt ?? undefined,
    call: callMeta,
  };
}
