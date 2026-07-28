import { useRouter } from "expo-router";
import React from "react";

import { Text } from "@/components/Themed";
import { AnimatedListItem } from "@/components/ui/AnimatedListItem";
import { Card } from "@/components/ui/Card";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import type { QueueItemResponse } from "@/lib/api/manual-calling";

type Props = {
  item: QueueItemResponse;
  index?: number;
};

export function CallQueueRow({ item, index = 0 }: Props) {
  const theme = useTheme();
  const router = useRouter();
  const target = item.target;
  const name = target?.displayName ?? "—";
  const sub = [target?.companyName, target?.phone].filter(Boolean).join(" · ");

  return (
    <AnimatedListItem index={index}>
      <Card
        onPress={() => router.push("/calls/queue")}
        variant="elevated"
        style={{ marginBottom: theme.spacing.sm }}>
        <Text style={theme.typography.bodyMedium}>
          {name}
          {item.source === "MISSED_CALL" ? ` · ${t("calls.missed")}` : ""}
        </Text>
        {sub ? (
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
            {sub}
          </Text>
        ) : null}
      </Card>
    </AnimatedListItem>
  );
}
