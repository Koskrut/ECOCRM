"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { trackEvent, type TrackingEventName } from "@/lib/tracking";

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & {
  eventName: TrackingEventName;
  payload?: Record<string, unknown>;
  children: ReactNode;
};

export function TrackedLink({ eventName, payload, children, onClick, ...rest }: Props) {
  return (
    <a
      {...rest}
      onClick={(e) => {
        trackEvent(eventName, payload ?? {});
        onClick?.(e);
      }}
    >
      {children}
    </a>
  );
}

