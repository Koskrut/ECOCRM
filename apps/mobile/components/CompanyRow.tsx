import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";

import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { Text } from "@/components/Themed";
import { AnimatedListItem } from "@/components/ui/AnimatedListItem";
import { useTheme } from "@/lib/design/theme-context";
import type { Company } from "@/types/crm";

export function companyDisplaySub(company: Company): string {
  return company.phone ?? company.address ?? company.edrpou ?? company.taxId ?? "";
}

type CompanyRowProps = {
  company: Company;
  onPress: () => void;
  onCall?: () => void;
  onNavigate?: () => void;
  onOrder?: () => void;
  index?: number;
};

export function CompanyRow({
  company,
  onPress,
  onCall,
  onNavigate,
  onOrder,
  index = 0,
}: CompanyRowProps) {
  const theme = useTheme();
  const sub = companyDisplaySub(company);
  const showActions = !!(onCall || onNavigate || onOrder);

  return (
    <AnimatedListItem index={index}>
      <Card onPress={onPress} variant="elevated" style={{ marginBottom: theme.spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.surfaceMuted,
              alignItems: "center",
              justifyContent: "center",
              marginRight: theme.spacing.sm,
            }}>
            <Ionicons name="business-outline" size={18} color={theme.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={theme.typography.bodyMedium}>{company.name}</Text>
            {sub ? (
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
                {sub}
              </Text>
            ) : null}
          </View>
          {showActions ? (
            <View style={{ flexDirection: "row", gap: 4, marginLeft: 8 }}>
              {onCall ? (
                <IconButton name="call-outline" onPress={onCall} accessibilityLabel="call" />
              ) : null}
              {onNavigate ? (
                <IconButton name="navigate-outline" onPress={onNavigate} accessibilityLabel="navigate" />
              ) : null}
              {onOrder ? (
                <IconButton name="cart-outline" onPress={onOrder} accessibilityLabel="order" />
              ) : null}
            </View>
          ) : (
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
          )}
        </View>
      </Card>
    </AnimatedListItem>
  );
}
