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
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
        {rightAction != null ? <div className="shrink-0">{rightAction}</div> : null}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}
