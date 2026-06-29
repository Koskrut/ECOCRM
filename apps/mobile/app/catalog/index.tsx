import React from "react";

import { AppHeader } from "@/components/ui/AppHeader";
import { CatalogPanel } from "@/components/work/CatalogPanel";
import { Screen } from "@/components/ui/Screen";
import { t } from "@/lib/i18n";

export default function CatalogScreen() {
  return (
    <Screen>
      <AppHeader title={t("catalog.title")} large={false} />
      <CatalogPanel />
    </Screen>
  );
}
