import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { AppButton } from "@/components/ui/AppButton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { VisitLocationSection } from "@/components/visit/VisitLocationSection";
import {
  buildVisitLocationUpdatePayload,
  visitLocationFromVisit,
  visitLocationHasCoords,
  type VisitLocationValue,
} from "@/lib/visit-location.types";
import { contactsApi } from "@/lib/api/contacts";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import type { CompanyAddress, Contact, VisitSummary } from "@/types/crm";

type Props = {
  visible: boolean;
  token: string;
  visit: VisitSummary;
  contact: Contact;
  mapsApiKey: string | null;
  loading?: boolean;
  onClose: () => void;
  onSave: (payload: ReturnType<typeof buildVisitLocationUpdatePayload>) => void;
};

export function VisitLocationSheet({
  visible,
  token,
  visit,
  contact,
  mapsApiKey,
  loading = false,
  onClose,
  onSave,
}: Props) {
  const theme = useTheme();
  const [value, setValue] = useState<VisitLocationValue | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void contactsApi
      .listAddresses(token, contact.id)
      .then((items: CompanyAddress[]) => {
        if (cancelled) return;
        setValue(visitLocationFromVisit(visit, items));
        setError(false);
      })
      .catch(() => {
        if (!cancelled) {
          setValue(visitLocationFromVisit(visit, []));
          setError(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [visible, token, contact.id, visit]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t("visitLocation.changeLocation")}>
      <VisitLocationSection
        token={token}
        contact={contact}
        value={value}
        onChange={(next) => {
          setValue(next);
          setError(false);
        }}
        mapsApiKey={mapsApiKey}
        disabled={loading}
      />
      {error ? (
        <Text style={[theme.typography.caption, { color: theme.colors.danger, marginTop: 8 }]}>
          {t("visitLocation.coordsRequired")}
        </Text>
      ) : null}
      <View style={{ marginTop: 16, gap: 8 }}>
        <AppButton
          label={t("visitLocation.saveLocation")}
          onPress={() => {
            if (!value || !visitLocationHasCoords(value)) {
              setError(true);
              return;
            }
            onSave(buildVisitLocationUpdatePayload(value));
          }}
          loading={loading}
        />
        <AppButton label={t("common.cancel")} onPress={onClose} variant="secondary" />
      </View>
    </BottomSheet>
  );
}
