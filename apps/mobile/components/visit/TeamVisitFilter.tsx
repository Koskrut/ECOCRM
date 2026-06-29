import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { Chip } from "@/components/ui/Chip";
import type { TeamUser } from "@/lib/api/users";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";

type Props = {
  userId?: string;
  viewOwnerId: string;
  teamMembers: TeamUser[];
  showTeamSections: boolean;
  onViewOwnerIdChange: (ownerId: string) => void;
};

export function TeamVisitFilter({
  userId,
  viewOwnerId,
  teamMembers,
  showTeamSections,
  onViewOwnerIdChange,
}: Props) {
  const theme = useTheme();

  return (
    <View style={{ marginBottom: theme.spacing.sm }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}>
        <Chip
          label={t("today.teamAll")}
          selected={!viewOwnerId}
          onPress={() => onViewOwnerIdChange("")}
        />
        {userId ? (
          <Chip
            label={t("today.teamMine")}
            selected={viewOwnerId === userId}
            onPress={() => onViewOwnerIdChange(userId)}
          />
        ) : null}
        {teamMembers
          .filter((member) => member.id !== userId)
          .map((member) => (
            <Chip
              key={member.id}
              label={member.fullName || member.email}
              selected={viewOwnerId === member.id}
              onPress={() => onViewOwnerIdChange(member.id)}
            />
          ))}
      </ScrollView>
      {showTeamSections ? (
        <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: theme.spacing.sm }]}>
          {t("today.teamHint")}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, paddingVertical: 2 },
});
