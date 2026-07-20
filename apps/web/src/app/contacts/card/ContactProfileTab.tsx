"use client";

import { InlineEditableField } from "@/components/fields/InlineEditableField";
import { CustomFieldsPanel } from "@/components/metadata/CustomFieldsPanel";
import { ContactCardLayoutPanel } from "@/components/metadata/ContactCardLayoutPanel";
import { EntityChangeHistoryPanel } from "@/components/EntityChangeHistoryPanel";
import { EntitySection } from "@/components/sections/EntitySection";
import { strings } from "@/locales";
import type { ContactModalContact } from "./contact-modal.types";

const t = strings.contacts.card.profile;

type Props = {
  contact: ContactModalContact | null;
  contactId: string;
  isCreate: boolean;
  saving: boolean;
  isAdmin: boolean;
  onPatch: (payload: Record<string, unknown>) => Promise<void>;
  onRegisterCancel: (cancel: (() => void) | null) => void;
};

export function ContactProfileTab({
  contact,
  contactId,
  isCreate,
  saving,
  isAdmin,
  onPatch,
  onRegisterCancel,
}: Props) {
  if (isCreate) {
    return <p className="text-sm text-zinc-500">{strings.contacts.card.saveContactFirst}</p>;
  }

  return (
    <div className="space-y-3">
      {contact ? (
        <EntitySection title={t.deepFields}>
          <div className="space-y-3">
            <InlineEditableField
              label={t.externalCode}
              value={contact.externalCode ?? ""}
              placeholder={strings.contacts.card.identity.clickToAdd}
              kind="text"
              disabled={saving}
              onSave={async (next) => onPatch({ externalCode: next?.trim() || null })}
              onRegisterCancel={onRegisterCancel}
            />
            <InlineEditableField
              label={t.documentDisplayName}
              value={contact.documentDisplayName ?? ""}
              placeholder={t.documentPlaceholder}
              kind="text"
              disabled={saving}
              onSave={async (next) => onPatch({ documentDisplayName: next?.trim() || null })}
              onRegisterCancel={onRegisterCancel}
            />
          </div>
        </EntitySection>
      ) : null}

      <EntitySection title={t.customFields}>
        <CustomFieldsPanel entityType="CONTACT" entityId={contactId} />
      </EntitySection>

      <EntitySection title={t.changeHistory}>
        <EntityChangeHistoryPanel entityType="Contact" entityId={contactId} />
      </EntitySection>

      {isAdmin ? (
        <EntitySection title={t.runtimeLayout}>
          <ContactCardLayoutPanel contactId={contactId} />
        </EntitySection>
      ) : null}
    </div>
  );
}
