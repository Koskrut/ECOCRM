import { useEffect, useMemo, useState } from "react";

import { usersApi, type TeamUser } from "@/lib/api/users";
import { groupVisitsByOwner, isTeamVisitViewer } from "@/lib/team-visits";
import type { VisitSummary } from "@/types/crm";

export function useTeamVisitFilter(
  token: string | null | undefined,
  user: { id: string; role: string } | null | undefined,
  visits: VisitSummary[],
) {
  const [viewOwnerId, setViewOwnerId] = useState("");
  const [teamMembers, setTeamMembers] = useState<TeamUser[]>([]);

  const isTeamLead = isTeamVisitViewer(user?.role);
  const showTeamSections = isTeamLead && !viewOwnerId;

  const teamGroups = useMemo(() => {
    if (!showTeamSections || !user?.id) return null;
    return groupVisitsByOwner(visits, user.id);
  }, [visits, showTeamSections, user?.id]);

  useEffect(() => {
    if (!token || !isTeamLead) {
      setTeamMembers([]);
      return;
    }
    let cancelled = false;
    void usersApi
      .list(token)
      .then((users) => {
        if (!cancelled) setTeamMembers(users);
      })
      .catch(() => {
        if (!cancelled) setTeamMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token, isTeamLead]);

  return {
    isTeamLead,
    viewOwnerId,
    setViewOwnerId,
    teamMembers,
    showTeamSections,
    teamGroups,
  };
}
