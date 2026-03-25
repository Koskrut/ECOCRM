"use client";

import type { ContactModalStrings } from "./contact-modal-strings";
import type { ContactCardPayload } from "./contact-card.types";
import { ContactKpiStrip } from "./ContactKpiStrip";
import { ContactQuickActions } from "./ContactQuickActions";
import type { ContactLeftTabId } from "./ContactCardTabBar";
import { ContactCardTabBar } from "./ContactCardTabBar";

type ContactLite = {
  phone?: string | null;
  email?: string | null;
  telegramLinked?: boolean;
  telegramConversationId?: string | null;
};

type Props = {
  cardV2: boolean;
  isCreate: boolean;
  contact: ContactLite | null;
  cardSnapshot: ContactCardPayload | null;
  cardLoading: boolean;
  listLoading: boolean;
  cardError: string | null;
  onCreateOrder: () => void;
  onScheduleVisit: () => void;
  onOpenTasksTab: () => void;
  onOpenPaymentOrder: (orderId: string) => void;
  visitDisabled: boolean;
  paymentOrderId: string | null;
  leftTab: ContactLeftTabId;
  onTabChange: (tab: ContactLeftTabId) => void;
  labels: ContactModalStrings;
};

export function ContactCardTabsUnderHeader({
  cardV2,
  isCreate,
  contact,
  cardSnapshot,
  cardLoading,
  listLoading,
  cardError,
  onCreateOrder,
  onScheduleVisit,
  onOpenTasksTab,
  onOpenPaymentOrder,
  visitDisabled,
  paymentOrderId,
  leftTab,
  onTabChange,
  labels,
}: Props) {
  return (
    <div>
      {cardV2 && !isCreate ? (
        <ContactKpiStrip
          data={cardSnapshot}
          loading={cardLoading || (listLoading && !cardSnapshot)}
        />
      ) : null}
      {cardV2 && cardError ? (
        <p className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {cardError}
        </p>
      ) : null}
      {cardV2 && !isCreate && contact ? (
        <ContactQuickActions
          phone={contact.phone}
          email={contact.email}
          telegramLinked={!!contact.telegramLinked}
          telegramConversationId={contact.telegramConversationId}
          onCreateOrder={onCreateOrder}
          onScheduleVisit={onScheduleVisit}
          onOpenTasks={onOpenTasksTab}
          onOpenPayment={paymentOrderId ? () => onOpenPaymentOrder(paymentOrderId) : undefined}
          visitDisabled={visitDisabled}
          labels={{
            quickCall: labels.quickCall,
            quickEmail: labels.quickEmail,
            quickTelegram: labels.quickTelegram,
            quickVisit: labels.quickVisit,
            quickOrderShort: labels.quickOrderShort,
            quickTask: labels.quickTask,
            quickPayment: labels.quickPayment,
            tooltipNoPhone: labels.tooltipNoPhone,
          }}
        />
      ) : null}
      <ContactCardTabBar leftTab={leftTab} onTabChange={onTabChange} labels={labels} />
    </div>
  );
}
