import React, { useEffect } from "react";

import { useAuth } from "@/context/auth-context";
import { startPresenceHeartbeat } from "@/lib/presence-heartbeat";

export function PresenceHeartbeatProvider({ children }: { children: React.ReactNode }) {
  const { token, ready } = useAuth();

  useEffect(() => {
    if (!ready || !token) return;
    return startPresenceHeartbeat(token);
  }, [ready, token]);

  return <>{children}</>;
}
