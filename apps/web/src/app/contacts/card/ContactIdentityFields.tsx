"use client";

import { InlineEditableField } from "@/components/fields/InlineEditableField";
import { SearchableSelectLite } from "@/components/inputs/SearchableSelectLite";
import {
  EntityAddressesSection,
} from "@/components/EntityAddressesSection";
import { KyivstarDialButton } from "@/components/kyivstar/KyivstarDialButton";
import { formatDateTime } from "@/lib/crmDatetime";
import { formatPhoneDisplay } from "@/lib/formatPhone";
import { strings } from "@/locales";
import { CONTACT_REGION_OPTIONS } from "../contact-region-options";
import { ContactPhonesSection } from "./ContactPhonesSection";
import type { ContactModalContact } from "./contact-modal.types";

const t = strings.contacts.card.identity;
const createT = strings.contacts.create;

type SelectOption = { id: string; label: string };

type Props = {
  contact: ContactModalContact;
  saving: boolean;
  ownerId: string | null;
  companyId: string | null;
  userOptions: SelectOption[];
  companyOptionsWithEmpty: SelectOption[];
  loadingUsers: boolean;
  loadingCompanies: boolean;
  addressRequiredForVisit: boolean;
  onOpenCompany?: (id: string) => void;
  onCompanySearchQueryChange?: (query: string) => void;
  onCompanySelected?: (company: { id: string; name: string } | null) => void;
  onPatch: (payload: Record<string, unknown>) => Promise<void>;
  onRefresh: () => void;
  onRegisterCancel: (cancel: (() => void) | null) => void;
};

export function ContactIdentityFields({
  contact,
  saving,
  ownerId,
  companyId,
  userOptions,
  companyOptionsWithEmpty,
  loadingUsers,
  loadingCompanies,
  addressRequiredForVisit,
  onOpenCompany,
  onCompanySearchQueryChange,
  onCompanySelected,
  onPatch,
  onRefresh,
  onRegisterCancel,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 py-1">
        {contact.telegramLinked ? (
          <>
            <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-800">
              {t.telegramConnected}
              {contact.telegramUsername ? ` @${contact.telegramUsername}` : ""}
            </span>
            {contact.telegramConversationId ? (
              <a
                href={`/inbox/telegram?conversationId=${contact.telegramConversationId}`}
                className="inline-flex items-center rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {t.openTelegram}
              </a>
            ) : null}
          </>
        ) : (
          <span className="text-xs text-zinc-500">{t.telegramNotConnected}</span>
        )}
      </div>

      <InlineEditableField
        label={t.firstName}
        value={contact.firstName}
        placeholder={t.clickToAdd}
        kind="text"
        required
        disabled={saving}
        onSave={async (next) => {
          await onPatch({ firstName: next ?? "" });
        }}
        onRegisterCancel={onRegisterCancel}
      />
      <InlineEditableField
        label={t.lastName}
        value={contact.lastName}
        placeholder={t.clickToAdd}
        kind="text"
        required
        disabled={saving}
        onSave={async (next) => {
          await onPatch({ lastName: next ?? "" });
        }}
        onRegisterCancel={onRegisterCancel}
      />
      <InlineEditableField
        label={t.phonePrimary}
        value={formatPhoneDisplay(contact.phone ?? "")}
        placeholder={t.clickToAdd}
        kind="text"
        required
        disabled={saving}
        onSave={async (next) => {
          await onPatch({ phone: next ?? "" });
        }}
        onRegisterCancel={onRegisterCancel}
      />
      {contact.phone ? (
        <div className="flex flex-wrap items-center gap-2 pl-1">
          <KyivstarDialButton phone={contact.phone} size="md" label="Click2Dial Kyivstar" />
          <a
            href={`tel:${contact.phone}`}
            className="text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-800"
          >
            tel:
          </a>
        </div>
      ) : null}
      <ContactPhonesSection
        contactId={contact.id}
        additionalPhones={contact.phones ?? []}
        onUpdated={onRefresh}
        saving={saving}
      />
      <InlineEditableField
        label={t.email}
        value={contact.email ?? ""}
        placeholder={t.clickToAdd}
        kind="text"
        disabled={saving}
        onSave={async (next) => onPatch({ email: next })}
        onRegisterCancel={onRegisterCancel}
      />
      <InlineEditableField
        label={t.position}
        value={contact.position ?? ""}
        placeholder={t.clickToAdd}
        kind="text"
        disabled={saving}
        onSave={async (next) => onPatch({ position: next })}
        onRegisterCancel={onRegisterCancel}
      />
      <InlineEditableField
        label={t.region}
        value={contact.region ?? ""}
        placeholder="—"
        kind="select"
        options={CONTACT_REGION_OPTIONS}
        disabled={saving}
        onSave={async (next) => onPatch({ region: next?.trim() || null })}
        onRegisterCancel={onRegisterCancel}
      />
      <InlineEditableField
        label={t.clientType}
        value={contact.clientType ?? ""}
        placeholder="—"
        kind="select"
        options={[
          { value: "", label: "—" },
          { value: "Врач", label: createT.clientTypeDoctor },
          { value: "Техник", label: createT.clientTypeTechnician },
        ]}
        disabled={saving}
        onSave={async (next) => onPatch({ clientType: next?.trim() || null })}
        onRegisterCancel={onRegisterCancel}
      />
      <InlineEditableField
        label={t.status}
        value={contact.status ?? ""}
        placeholder="—"
        kind="select"
        options={[
          { value: "", label: "—" },
          { value: "Клієнт", label: createT.statusClient },
          { value: "Зацікавленний", label: createT.statusInterested },
          { value: "Тимчасово не працює", label: createT.statusTempInactive },
          { value: "Відмова", label: createT.statusRefused },
          { value: "Немає зв'язку", label: createT.statusNoContact },
          { value: "Видалити", label: createT.statusDelete },
          { value: "Не працює з імплантами", label: createT.statusNoImplants },
        ]}
        disabled={saving}
        onSave={async (next) => onPatch({ status: next?.trim() || null })}
        onRegisterCancel={onRegisterCancel}
      />

      <EntityAddressesSection
        entityType="contact"
        entityId={contact.id}
        disabled={saving}
        highlightMissingCoords={addressRequiredForVisit}
        onUpdated={onRefresh}
      />

      <div className="flex items-center justify-between gap-4 py-1">
        <span className="text-sm text-zinc-500">{t.owner}</span>
        <SearchableSelectLite
          variant="inline"
          value={ownerId}
          options={userOptions}
          placeholder={t.clickToAdd}
          disabled={saving || loadingUsers}
          isLoading={loadingUsers}
          onChange={async (id) => {
            await onPatch({ ownerId: id });
          }}
        />
      </div>
      <div className="flex items-center justify-between gap-4 py-1">
        <span className="text-sm text-zinc-500">{t.company}</span>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <SearchableSelectLite
            variant="inline"
            value={companyId ?? ""}
            options={companyOptionsWithEmpty}
            placeholder={t.clickToAdd}
            disabled={saving}
            isLoading={loadingCompanies}
            onSearchQueryChange={onCompanySearchQueryChange}
            onChange={async (id) => {
              const nextId = id === "" ? null : id;
              if (!nextId) {
                onCompanySelected?.(null);
              } else {
                const opt = companyOptionsWithEmpty.find((o) => o.id === nextId);
                onCompanySelected?.(opt && opt.id ? { id: opt.id, name: opt.label } : null);
              }
              await onPatch({ companyId: nextId });
            }}
            onCreate={onOpenCompany ? () => onOpenCompany("new") : undefined}
            createLabel={createT.createCompany}
          />
          {onOpenCompany && companyId ? (
            <button
              type="button"
              onClick={() => onOpenCompany(companyId)}
              className="shrink-0 text-sm text-zinc-700 hover:underline"
            >
              {t.openCompany}
            </button>
          ) : null}
        </div>
      </div>
      <div className="pt-2 text-xs text-zinc-500">
        {t.created}: {formatDateTime(contact.createdAt)}
        <br />
        {t.updated}: {formatDateTime(contact.updatedAt)}
      </div>
    </div>
  );
}
