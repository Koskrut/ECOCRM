import { NpCitySelect, NpStreetSelect, NpWarehouseSelect } from "@/components/inputs/NpDirectorySelects";
import { strings } from "@/locales";

export type NpRecipientTypeUi = "PERSON" | "COMPANY";
export type NpDeliveryTypeUi = "WAREHOUSE" | "POSTOMAT" | "ADDRESS";

export type NpShippingProfileFormValues = {
  label: string;

  recipientType: NpRecipientTypeUi;
  deliveryType: NpDeliveryTypeUi;

  // PERSON
  lastName: string;
  firstName: string;
  middleName: string;
  phone: string;

  // COMPANY
  companyName: string;
  edrpou: string;
  contactPersonLastName: string;
  contactPersonFirstName: string;
  contactPersonMiddleName: string;
  contactPersonPhone: string;

  // LOCATION
  cityRef: string;
  cityName: string;

  // WAREHOUSE/POSTOMAT
  warehouseRef: string;
  warehouseLabel: string;
  warehouseNumber: string;

  // ADDRESS
  streetRef: string;
  streetName: string;
  building: string;
  flat: string;
};

export function validateNpShippingProfileForm(
  v: NpShippingProfileFormValues,
  opts: { requireLabel: boolean },
): string | null {
  const t = strings.np.shippingProfileForm;
  if (opts.requireLabel && !v.label.trim()) return t.errors.labelRequired;

  if (v.recipientType === "PERSON") {
    if (!v.lastName.trim() || !v.firstName.trim()) return t.errors.personNameRequired;
    if (!v.phone.trim()) return t.errors.personPhoneRequired;
  } else {
    if (!v.companyName.trim()) return t.errors.companyNameRequired;
    if (!v.edrpou.trim()) return t.errors.companyEdrpouRequired;
    if (!v.contactPersonFirstName.trim()) return t.errors.contactPersonFirstNameRequired;
    if (!v.contactPersonLastName.trim()) return t.errors.contactPersonLastNameRequired;
    if (!v.contactPersonPhone.trim()) return t.errors.contactPersonPhoneRequired;
  }

  if (!v.cityRef.trim()) return t.errors.cityRequired;

  if (v.deliveryType === "ADDRESS") {
    if (!v.streetRef.trim()) return t.errors.streetRequired;
    if (!v.building.trim()) return t.errors.buildingRequired;
    return null;
  }

  if (!v.warehouseRef.trim()) return t.errors.warehouseRequired;
  return null;
}

export function buildContactShippingProfilePayload(
  v: NpShippingProfileFormValues,
  opts: { requireLabel: boolean },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    label: v.label.trim(),
    recipientType: v.recipientType,
    deliveryType: v.deliveryType,

    // PERSON
    firstName: v.firstName.trim() || null,
    lastName: v.lastName.trim() || null,
    middleName: v.middleName.trim() || null,
    phone: v.phone.trim() || null,

    // COMPANY
    companyName: v.companyName.trim() || null,
    edrpou: v.edrpou.trim() || null,
    contactPersonFirstName: v.contactPersonFirstName.trim() || null,
    contactPersonLastName: v.contactPersonLastName.trim() || null,
    contactPersonMiddleName: v.contactPersonMiddleName.trim() || null,
    contactPersonPhone: v.contactPersonPhone.trim() || null,

    // LOCATION
    cityRef: v.cityRef.trim() || null,
    cityName: v.cityName.trim() || null,
  };

  if (v.deliveryType === "ADDRESS") {
    payload.streetRef = v.streetRef.trim() || null;
    payload.streetName = v.streetName.trim() || null;
    payload.building = v.building.trim() || null;
    payload.flat = v.flat.trim() || null;
    payload.warehouseRef = null;
    payload.warehouseNumber = null;
  } else {
    payload.warehouseRef = v.warehouseRef.trim() || null;
    payload.warehouseNumber = v.warehouseNumber.trim() || null;
    payload.streetRef = null;
    payload.streetName = null;
    payload.building = null;
    payload.flat = null;
  }

  if (opts.requireLabel) {
    payload.label = v.label.trim();
  } else {
    payload.label = v.label.trim() || null;
  }

  return payload;
}

export function NpShippingProfileFormFields({
  disabled,
  requireLabel,
  values,
  onChange,
  showSaveToContact,
  saveToContact,
  onSaveToContactChange,
}: {
  disabled?: boolean;
  requireLabel: boolean;
  values: NpShippingProfileFormValues;
  onChange: (patch: Partial<NpShippingProfileFormValues>) => void;
  showSaveToContact?: boolean;
  saveToContact?: boolean;
  onSaveToContactChange?: (next: boolean) => void;
}) {
  const t = strings.np.shippingProfileForm;
  const inputClass =
    "mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none";

  return (
    <div className="space-y-3">
      {showSaveToContact ? (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-800">{t.titleNewAddress}</h3>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={!!saveToContact}
              onChange={(e) => onSaveToContactChange?.(e.target.checked)}
              className="h-4 w-4"
              disabled={disabled}
            />
            {t.saveToContact}
          </label>
        </div>
      ) : null}

      {(requireLabel || !!saveToContact) && (
        <div>
          <label className="block text-xs font-medium text-zinc-600">
            {t.label}{" "}
            {requireLabel ? (
              "*"
            ) : (
              <span className="text-zinc-500">{" "}{t.labelOptionalHint}</span>
            )}
          </label>
          <input
            type="text"
            value={values.label}
            onChange={(e) => onChange({ label: e.target.value })}
            className={inputClass}
            placeholder={
              requireLabel ? t.labelPlaceholderRequired : t.labelPlaceholderOptional
            }
            disabled={disabled}
          />
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-medium text-zinc-600">{t.recipientType}</p>
        <div className="flex gap-4">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="npRecipientType"
              checked={values.recipientType === "PERSON"}
              onChange={() => onChange({ recipientType: "PERSON" })}
              className="h-4 w-4"
              disabled={disabled}
            />
            <span className="text-sm">{t.recipientPerson}</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="npRecipientType"
              checked={values.recipientType === "COMPANY"}
              onChange={() => onChange({ recipientType: "COMPANY" })}
              className="h-4 w-4"
              disabled={disabled}
            />
            <span className="text-sm">{t.recipientCompany}</span>
          </label>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-zinc-600">{t.deliveryType}</p>
        <div className="flex flex-wrap gap-3">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="npDeliveryType"
              checked={values.deliveryType === "WAREHOUSE"}
              onChange={() =>
                onChange({
                  deliveryType: "WAREHOUSE",
                  streetRef: "",
                  streetName: "",
                  building: "",
                  flat: "",
                })
              }
              className="h-4 w-4"
              disabled={disabled}
            />
            <span className="text-sm">{t.deliveryWarehouse}</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="npDeliveryType"
              checked={values.deliveryType === "POSTOMAT"}
              onChange={() =>
                onChange({
                  deliveryType: "POSTOMAT",
                  streetRef: "",
                  streetName: "",
                  building: "",
                  flat: "",
                })
              }
              className="h-4 w-4"
              disabled={disabled}
            />
            <span className="text-sm">{t.deliveryPostomat}</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="npDeliveryType"
              checked={values.deliveryType === "ADDRESS"}
              onChange={() =>
                onChange({
                  deliveryType: "ADDRESS",
                  warehouseRef: "",
                  warehouseLabel: "",
                  warehouseNumber: "",
                })
              }
              className="h-4 w-4"
              disabled={disabled}
            />
            <span className="text-sm">{t.deliveryAddress}</span>
          </label>
        </div>
      </div>

      {values.recipientType === "PERSON" ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-600">{t.personLastName} *</label>
              <input
                type="text"
                value={values.lastName}
                onChange={(e) => onChange({ lastName: e.target.value })}
                className={inputClass}
                disabled={disabled}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">{t.personFirstName} *</label>
              <input
                type="text"
                value={values.firstName}
                onChange={(e) => onChange({ firstName: e.target.value })}
                className={inputClass}
                disabled={disabled}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">{t.personMiddleName}</label>
            <input
              type="text"
              value={values.middleName}
              onChange={(e) => onChange({ middleName: e.target.value })}
              className={inputClass}
              disabled={disabled}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">{t.personPhone} *</label>
            <input
              type="text"
              value={values.phone}
              onChange={(e) => onChange({ phone: e.target.value })}
              className={inputClass}
              disabled={disabled}
            />
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="block text-xs font-medium text-zinc-600">{t.companyName} *</label>
            <input
              type="text"
              value={values.companyName}
              onChange={(e) => onChange({ companyName: e.target.value })}
              className={inputClass}
              disabled={disabled}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">{t.companyEdrpou} *</label>
            <input
              type="text"
              value={values.edrpou}
              onChange={(e) => onChange({ edrpou: e.target.value })}
              className={inputClass}
              disabled={disabled}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-600">{t.contactPersonLastName} *</label>
              <input
                type="text"
                value={values.contactPersonLastName}
                onChange={(e) => onChange({ contactPersonLastName: e.target.value })}
                className={inputClass}
                disabled={disabled}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">{t.contactPersonFirstName} *</label>
              <input
                type="text"
                value={values.contactPersonFirstName}
                onChange={(e) => onChange({ contactPersonFirstName: e.target.value })}
                className={inputClass}
                disabled={disabled}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">{t.contactPersonMiddleName}</label>
            <input
              type="text"
              value={values.contactPersonMiddleName}
              onChange={(e) => onChange({ contactPersonMiddleName: e.target.value })}
              className={inputClass}
              disabled={disabled}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">{t.contactPersonPhone} *</label>
            <input
              type="text"
              value={values.contactPersonPhone}
              onChange={(e) => onChange({ contactPersonPhone: e.target.value })}
              className={inputClass}
              disabled={disabled}
            />
          </div>
        </>
      )}

      <div>
        <label className="block text-xs font-medium text-zinc-600">{t.city} *</label>
        <NpCitySelect
          valueRef={values.cityRef}
          valueLabel={values.cityName}
          onChange={(ref, name) =>
            onChange({
              cityRef: ref,
              cityName: name,
              warehouseRef: "",
              warehouseLabel: "",
              warehouseNumber: "",
              streetRef: "",
              streetName: "",
              building: "",
              flat: "",
            })
          }
          disabled={disabled}
          placeholder={t.cityPlaceholder}
        />
      </div>

      {values.deliveryType === "ADDRESS" ? (
        <>
          <div>
            <label className="block text-xs font-medium text-zinc-600">{t.street} *</label>
            <NpStreetSelect
              cityRef={values.cityRef}
              valueRef={values.streetRef}
              valueLabel={values.streetName}
              onChange={(ref, name) => onChange({ streetRef: ref, streetName: name })}
              disabled={disabled}
              placeholder={t.streetPlaceholder}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-600">{t.building} *</label>
              <input
                type="text"
                value={values.building}
                onChange={(e) => onChange({ building: e.target.value })}
                className={inputClass}
                disabled={disabled}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">{t.flat}</label>
              <input
                type="text"
                value={values.flat}
                onChange={(e) => onChange({ flat: e.target.value })}
                className={inputClass}
                disabled={disabled}
              />
            </div>
          </div>
        </>
      ) : (
        <div>
          <label className="block text-xs font-medium text-zinc-600">
            {values.deliveryType === "POSTOMAT" ? `${t.postomat} *` : `${t.warehouse} *`}
          </label>
          <NpWarehouseSelect
            key={values.deliveryType}
            cityRef={values.cityRef}
            type={values.deliveryType}
            valueRef={values.warehouseRef}
            valueLabel={values.warehouseLabel}
            onChange={(ref, lbl, num) =>
              onChange({
                warehouseRef: ref,
                warehouseLabel: lbl,
                warehouseNumber: num ?? "",
              })
            }
            disabled={disabled}
            placeholder={t.warehousePlaceholder}
          />
        </div>
      )}
    </div>
  );
}

