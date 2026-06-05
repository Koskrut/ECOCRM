"use client";

import { SearchableSelectLite } from "@/components/inputs/SearchableSelectLite";
import { strings } from "@/locales";
import { formatPhoneInputMask, normalizePhone } from "@/lib/formatPhone";
import { CONTACT_REGION_OPTIONS } from "./contact-region-options";
import type { ContactPhoneDuplicateState } from "./useContactPhoneDuplicateCheck";

const t = strings.contacts.create;

export type ContactCreateFormValues = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  position: string;
  externalCode: string;
  region: string;
  clientType: string;
  status: string;
  companyId: string | null;
  ownerId: string | null;
};

type Props = {
  values: ContactCreateFormValues;
  saving: boolean;
  companyOptions: Array<{ id: string; label: string }>;
  userOptions: Array<{ id: string; label: string }>;
  loadingCompanies: boolean;
  loadingUsers: boolean;
  duplicate: ContactPhoneDuplicateState;
  onChange: <K extends keyof ContactCreateFormValues>(
    key: K,
    value: ContactCreateFormValues[K],
  ) => void;
  onOpenCompany?: (id: string) => void;
  onOpenExistingContact?: (id: string) => void;
};

const labelClass = "block text-sm font-medium text-zinc-700";

const optionalControlClass =
  "mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none transition-colors focus:border-zinc-400";

function requiredControlClass(filled: boolean): string {
  const base =
    "mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none transition-colors focus:ring-1";
  if (filled) {
    return `${base} border-emerald-300 bg-emerald-50/50 focus:border-emerald-500 focus:ring-emerald-200`;
  }
  return `${base} border-red-200 bg-red-50/40 focus:border-red-400 focus:ring-red-100`;
}

function isTextFilled(value: string): boolean {
  return value.trim().length > 0;
}

function isPhoneFilled(phone: string): boolean {
  if (normalizePhone(phone)) return true;
  return phone.replace(/\D/g, "").length >= 9;
}

export function ContactCreateForm({
  values,
  saving,
  companyOptions,
  userOptions,
  loadingCompanies,
  loadingUsers,
  duplicate,
  onChange,
  onOpenCompany,
  onOpenExistingContact,
}: Props) {
  const companyOptionsWithEmpty = [{ id: "", label: t.noCompany }, ...companyOptions];
  const lastNameFilled = isTextFilled(values.lastName);
  const firstNameFilled = isTextFilled(values.firstName);
  const phoneFilled = isPhoneFilled(values.phone);
  const regionFilled = isTextFilled(values.region);

  return (
    <div className="space-y-4">
      {duplicate.match ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p>{t.duplicateMessage}</p>
          <p className="mt-1 font-medium">
            {[duplicate.match.lastName, duplicate.match.firstName].filter(Boolean).join(" ") ||
              duplicate.match.phone}
          </p>
          {onOpenExistingContact ? (
            <button
              type="button"
              className="mt-2 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
              onClick={() => onOpenExistingContact(duplicate.match!.id)}
            >
              {t.openExisting}
            </button>
          ) : null}
        </div>
      ) : null}

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t.sectionMain}</h3>
        <div className="mt-3 space-y-3">
          <div>
            <label className={labelClass}>{t.lastName}</label>
            <input
              className={requiredControlClass(lastNameFilled)}
              value={values.lastName}
              onChange={(e) => onChange("lastName", e.target.value)}
              disabled={saving}
              aria-invalid={!lastNameFilled}
              autoComplete="family-name"
            />
          </div>
          <div>
            <label className={labelClass}>{t.firstName}</label>
            <input
              className={requiredControlClass(firstNameFilled)}
              value={values.firstName}
              onChange={(e) => onChange("firstName", e.target.value)}
              disabled={saving}
              aria-invalid={!firstNameFilled}
              autoComplete="given-name"
            />
          </div>
          <div>
            <label className={labelClass}>{t.phone}</label>
            <input
              className={requiredControlClass(phoneFilled)}
              value={values.phone}
              onChange={(e) => onChange("phone", formatPhoneInputMask(e.target.value))}
              disabled={saving}
              aria-invalid={!phoneFilled}
              inputMode="tel"
              autoComplete="tel"
            />
            {duplicate.loading ? (
              <p className="mt-1 text-xs text-zinc-500">{strings.common.loading}</p>
            ) : null}
          </div>
          <div>
            <label className={labelClass}>{t.region}</label>
            <select
              className={requiredControlClass(regionFilled)}
              value={values.region}
              onChange={(e) => onChange("region", e.target.value)}
              disabled={saving}
              aria-invalid={!regionFilled}
            >
              <option value="">{t.selectRegion}</option>
              {CONTACT_REGION_OPTIONS.filter((o) => o.value).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>{t.clientType}</label>
            <select
              className={optionalControlClass}
              value={values.clientType}
              onChange={(e) => onChange("clientType", e.target.value)}
              disabled={saving}
            >
              <option value="">—</option>
              <option value="Врач">{t.clientTypeDoctor}</option>
              <option value="Техник">{t.clientTypeTechnician}</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>{t.status}</label>
            <select
              className={optionalControlClass}
              value={values.status}
              onChange={(e) => onChange("status", e.target.value)}
              disabled={saving}
            >
              <option value="">—</option>
              <option value="Клієнт">{t.statusClient}</option>
              <option value="Зацікавленний">{t.statusInterested}</option>
              <option value="Тимчасово не працює">{t.statusTempInactive}</option>
              <option value="Відмова">{t.statusRefused}</option>
              <option value="Немає зв'язку">{t.statusNoContact}</option>
              <option value="Видалити">{t.statusDelete}</option>
              <option value="Не працює з імплантами">{t.statusNoImplants}</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>{t.company}</label>
            <div className="mt-1 flex gap-2">
              <div className="min-w-0 flex-1">
                <SearchableSelectLite
                  value={values.companyId ?? ""}
                  options={companyOptionsWithEmpty}
                  placeholder={t.noCompany}
                  disabled={saving || loadingCompanies}
                  isLoading={loadingCompanies}
                  onChange={(id) => onChange("companyId", id === "" ? null : id)}
                />
              </div>
              {values.companyId && onOpenCompany ? (
                <button
                  type="button"
                  onClick={() => onOpenCompany(values.companyId!)}
                  className="shrink-0 rounded-md border border-zinc-200 px-2 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  {t.openCompany}
                </button>
              ) : null}
              {onOpenCompany ? (
                <button
                  type="button"
                  onClick={() => onOpenCompany("new")}
                  className="shrink-0 rounded-md border border-zinc-200 px-2 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  {t.createCompany}
                </button>
              ) : null}
            </div>
          </div>
          <div>
            <label className={labelClass}>{t.owner}</label>
            <div className="mt-1">
              <SearchableSelectLite
                value={values.ownerId ?? ""}
                options={userOptions}
                placeholder={t.notAssigned}
                disabled={saving || loadingUsers}
                isLoading={loadingUsers}
                onChange={(id) => onChange("ownerId", id)}
              />
            </div>
          </div>
        </div>
      </section>

      <details className="rounded-lg border border-zinc-200 bg-zinc-50/50">
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">
          {t.sectionAdditional}
        </summary>
        <div className="space-y-3 border-t border-zinc-200 px-3 py-3">
          <div>
            <label className={labelClass}>{t.email}</label>
            <input
              className={optionalControlClass}
              value={values.email}
              onChange={(e) => onChange("email", e.target.value)}
              disabled={saving}
              type="email"
              autoComplete="email"
            />
          </div>
          <div>
            <label className={labelClass}>{t.position}</label>
            <input
              className={optionalControlClass}
              value={values.position}
              onChange={(e) => onChange("position", e.target.value)}
              disabled={saving}
            />
          </div>
          <div>
            <label className={labelClass}>{t.externalCode}</label>
            <input
              className={optionalControlClass}
              value={values.externalCode}
              onChange={(e) => onChange("externalCode", e.target.value)}
              disabled={saving}
            />
          </div>
        </div>
      </details>
    </div>
  );
}
