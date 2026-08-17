"use client";

import { useCallback, useState } from "react";
import { CompanyModal } from "@/app/companies/CompanyModal";
import { ContactModal, type ContactCreateInitial } from "@/app/contacts/ContactModal";
import { OrderModal } from "@/app/orders/OrderModal";
import { ReturnModal } from "@/app/orders/ReturnModal";
import {
  entityModalFramesEqual,
  entityModalZIndex,
  nearestEntityId,
  type EntityModalFrame,
} from "@/lib/modal/useEntityModalStack";

type Props = {
  frames: EntityModalFrame[];
  root: EntityModalFrame | null;
  apiBaseUrl?: string;
  userRole?: string | null;
  onOpen: (frame: EntityModalFrame) => void;
  onCloseFrom: (index: number) => void;
  onReplace: (from: EntityModalFrame, to: EntityModalFrame) => void;
  onReplaceRoot?: (frame: EntityModalFrame) => void;
  onUpdate: () => void;
  onOrderSaved?: () => void;
  contactInitialCreate?: ContactCreateInitial;
};

export function EntityModalStackLayers({
  frames,
  root,
  apiBaseUrl = "/api",
  userRole,
  onOpen,
  onCloseFrom,
  onReplace,
  onReplaceRoot,
  onUpdate,
  onOrderSaved,
  contactInitialCreate,
}: Props) {
  const [ordersReloadKey, setOrdersReloadKey] = useState(0);

  const refreshOrders = useCallback(() => {
    setOrdersReloadKey((k) => k + 1);
    onOrderSaved?.();
    onUpdate();
  }, [onOrderSaved, onUpdate]);

  const openContact = useCallback((id: string) => onOpen({ type: "contact", id }), [onOpen]);
  const openCompany = useCallback((id: string) => onOpen({ type: "company", id }), [onOpen]);
  const openOrder = useCallback((id: string) => onOpen({ type: "order", id }), [onOpen]);
  const openReturn = useCallback((id: string) => onOpen({ type: "return", id }), [onOpen]);

  return (
    <>
      {frames.map((frame, index) => {
        const zIndex = entityModalZIndex(index);
        const onClose = () => onCloseFrom(index);

        if (frame.type === "contact") {
          const nearestCompany = nearestEntityId(frames, index, "company");
          const initialCreate =
            frame.id === "new"
              ? {
                  ...(nearestCompany ? { companyId: nearestCompany } : {}),
                  ...(root && entityModalFramesEqual(frame, root) ? contactInitialCreate : {}),
                }
              : undefined;
          return (
            <ContactModal
              key={`${frame.type}:${frame.id}`}
              apiBaseUrl={apiBaseUrl}
              contactId={frame.id}
              initialCreate={initialCreate}
              onClose={onClose}
              onCreated={(id) => {
                const next: EntityModalFrame = { type: "contact", id };
                if (root && entityModalFramesEqual(frame, root)) onReplaceRoot?.(next);
                else onReplace(frame, next);
              }}
              onOpenCompany={openCompany}
              onOpenOrder={openOrder}
              onOpenReturn={openReturn}
              onUpdate={onUpdate}
              userRole={userRole}
              zIndex={zIndex}
              externalOrdersReloadKey={ordersReloadKey}
            />
          );
        }

        if (frame.type === "company") {
          return (
            <CompanyModal
              key={`${frame.type}:${frame.id}`}
              apiBaseUrl={apiBaseUrl}
              companyId={frame.id}
              onClose={onClose}
              onUpdate={onUpdate}
              onOpenContact={openContact}
              onOpenOrder={openOrder}
              zIndex={zIndex}
              externalOrdersReloadKey={ordersReloadKey}
            />
          );
        }

        if (frame.type === "order") {
          return (
            <OrderModal
              key={`${frame.type}:${frame.id}`}
              apiBaseUrl={apiBaseUrl}
              orderId={frame.id}
              zIndex={zIndex}
              prefill={{
                clientId: nearestEntityId(frames, index, "contact"),
                companyId: nearestEntityId(frames, index, "company"),
              }}
              onClose={onClose}
              onSaved={refreshOrders}
              onOpenOrder={openOrder}
              onOpenContact={openContact}
              onOpenCompany={openCompany}
              userRole={userRole}
            />
          );
        }

        if (frame.type === "return") {
          return (
            <ReturnModal
              key={`${frame.type}:${frame.id}`}
              returnId={frame.id}
              zIndex={zIndex}
              onClose={onClose}
              onSaved={refreshOrders}
              onOpenOrder={openOrder}
            />
          );
        }

        return null;
      })}
    </>
  );
}
