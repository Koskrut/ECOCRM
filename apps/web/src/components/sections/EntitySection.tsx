"use client";

import React from "react";

export type EntitySectionProps = {
  title: string;
  rightAction?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Bordered card section for entity modal left column (entity modal standard).
 * Renders a section with title and optional action (e.g. Edit, Change, Open company).
 */
export function EntitySection({ title, rightAction, children }: EntitySectionProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-2">
        <h3 className="min-w-0 flex-1 text-sm font-semibold text-zinc-900">{title}</h3>
        {rightAction != null ? (
          <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">
            {rightAction}
          </div>
        ) : null}
      </div>
      <div className="mt-3 min-w-0">{children}</div>
    </div>
  );
}
