"use client";

import { EntitySection } from "@/components/sections/EntitySection";
import { strings } from "@/locales";
import { ContactAnalyticsTab } from "./ContactAnalyticsTab";
import { ContactReceivablesTab } from "./ContactReceivablesTab";
import type {
  ContactCardAnalytics,
  ContactCardAnalyticsRange,
  ContactCardAnalyticsScope,
} from "./useContactCardAnalytics";

const t = strings.contacts.card;

type Props = {
  contactId: string;
  isCreate: boolean;
  financeRestricted?: boolean;
  onOpenOrder: (id: string) => void;
  analytics: ContactCardAnalytics | null;
  analyticsLoading: boolean;
  analyticsError: string | null;
  range: ContactCardAnalyticsRange;
  scope: ContactCardAnalyticsScope;
  onRangeChange: (v: ContactCardAnalyticsRange) => void;
  onScopeChange: (v: ContactCardAnalyticsScope) => void;
  canUseCompanyScope: boolean;
};

export function ContactFinanceTab({
  contactId,
  isCreate,
  financeRestricted,
  onOpenOrder,
  analytics,
  analyticsLoading,
  analyticsError,
  range,
  scope,
  onRangeChange,
  onScopeChange,
  canUseCompanyScope,
}: Props) {
  if (isCreate) {
    return <p className="text-sm text-zinc-500">{t.saveContactFirst}</p>;
  }

  return (
    <div className="space-y-4">
      <EntitySection title={t.finance.receivables}>
        <ContactReceivablesTab
          contactId={contactId}
          financeRestricted={financeRestricted}
          onOpenOrder={onOpenOrder}
        />
      </EntitySection>
      <EntitySection title={t.finance.analytics}>
        <ContactAnalyticsTab
          analytics={analytics}
          loading={analyticsLoading}
          error={analyticsError}
          range={range}
          scope={scope}
          onRangeChange={onRangeChange}
          onScopeChange={onScopeChange}
          canUseCompanyScope={canUseCompanyScope}
        />
      </EntitySection>
    </div>
  );
}
