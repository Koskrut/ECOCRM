// apps/web/src/app/orders/TtnModal.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { NpCitySelect, NpWarehouseSelect, NpStreetSelect } from "@/components/inputs/NpDirectorySelects";
import { apiHttp } from "../../lib/api/client";

type NpDeliveryType = "WAREHOUSE" | "POSTOMAT" | "ADDRESS";
type NpRecipientType = "PERSON" | "COMPANY";

/**
 * UI view type (совмещаем с Prisma ContactShippingProfile)
 * Prisma: label, warehouseNumber, warehouseType, streetName/building/flat, ...
 */
export type NpShippingProfile = {
  id: string;
  label?: string | null;
  isDefault?: boolean | null;

  recipientType: NpRecipientType;
  deliveryType: NpDeliveryType;

  // PERSON
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;

  // CITY
  cityRef?: string | null;
  cityName?: string | null;

  // WAREHOUSE/POSTOMAT
  warehouseRef?: string | null;
  warehouseNumber?: string | null;
  warehouseType?: string | null;

  // ADDRESS
  streetRef?: string | null;
  streetName?: string | null;
  building?: string | null;
  flat?: string | null;
};

type ProfilesResponse = { items: NpShippingProfile[] } | NpShippingProfile[];

type Props = {
  apiBaseUrl: string; // usually "/api"
  open: boolean;
  onClose: () => void;

  orderId: string;

  // IMPORTANT: should be order.contactId (contact used for TTN)
  contactId: string;

  /** When no profiles exist, pre-fill NEW form with these values */
  defaultPerson?: { firstName?: string; lastName?: string; phone?: string } | null;

  onCreated?: (result: unknown) => void;
};

export function TtnModal({
  apiBaseUrl: _apiBaseUrl,
  open,
  onClose,
  orderId,
  contactId,
  defaultPerson,
  onCreated,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profiles, setProfiles] = useState<NpShippingProfile[]>([]);
  const [mode, setMode] = useState<"EXISTING" | "NEW">("EXISTING");
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");

  // NEW profile form
  const [saveToContact, setSaveToContact] = useState(true);
  const [label, setLabel] = useState("");

  const [recipientType, setRecipientType] = useState<NpRecipientType>("PERSON");
  const [npRecipientLastName, setNpRecipientLastName] = useState("");
  const [npRecipientFirstName, setNpRecipientFirstName] = useState("");
  const [npRecipientMiddleName, setNpRecipientMiddleName] = useState("");
  const [npRecipientPhone, setNpRecipientPhone] = useState("");

  const [npCompanyName, setNpCompanyName] = useState("");
  const [npEdrpou, setNpEdrpou] = useState("");
  const [npContactPersonFirstName, setNpContactPersonFirstName] = useState("");
  const [npContactPersonLastName, setNpContactPersonLastName] = useState("");
  const [npContactPersonPhone, setNpContactPersonPhone] = useState("");

  const [deliveryType, setDeliveryType] = useState<NpDeliveryType>("WAREHOUSE");
  const [cityRef, setCityRef] = useState("");
  const [cityName, setCityName] = useState("");
  const [warehouseRef, setWarehouseRef] = useState("");
  const [warehouseLabel, setWarehouseLabel] = useState("");
  const [warehouseNumber, setWarehouseNumber] = useState("");

  // ADDRESS
  const [streetRef, setStreetRef] = useState("");
  const [streetName, setStreetName] = useState("");
  const [building, setBuilding] = useState("");
  const [flat, setFlat] = useState("");

  const canClose = !loading && !creating;

  const resetNewForm = useCallback(() => {
    setSaveToContact(true);
    setLabel("");

    setRecipientType("PERSON");
    setNpRecipientLastName("");
    setNpRecipientFirstName("");
    setNpRecipientMiddleName("");
    setNpRecipientPhone("");

    setNpCompanyName("");
    setNpEdrpou("");
    setNpContactPersonFirstName("");
    setNpContactPersonLastName("");
    setNpContactPersonPhone("");

    setDeliveryType("WAREHOUSE");
    setCityRef("");
    setCityName("");
    setWarehouseRef("");
    setWarehouseLabel("");
    setWarehouseNumber("");

    setStreetRef("");
    setStreetName("");
    setBuilding("");
    setFlat("");
  }, []);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!contactId) {
        setProfiles([]);
        setMode("NEW");
        setSelectedProfileId("");
        return;
      }

      const res = await apiHttp.get<ProfilesResponse>(`/contacts/${contactId}/shipping-profiles`, {
        headers: { "Cache-Control": "no-store" },
      });

      const data = res.data;
      const rawItems = Array.isArray(data) ? data : data?.items || [];
      const items = rawItems.filter((p: NpShippingProfile) => typeof p?.id === "string" && p.id.trim() !== "");

      const sorted = [...items].sort((a, b) => Number(!!b.isDefault) - Number(!!a.isDefault));

      setProfiles(sorted);

      const firstId = sorted[0]?.id?.trim();
      if (sorted.length > 0 && firstId) {
        setMode("EXISTING");
        setSelectedProfileId(firstId);
      } else {
        setMode("NEW");
        setSelectedProfileId("");
        if (defaultPerson) {
          setNpRecipientLastName(defaultPerson.lastName ?? "");
          setNpRecipientFirstName(defaultPerson.firstName ?? "");
          setNpRecipientMiddleName("");
          setNpRecipientPhone(defaultPerson.phone ?? "");
        }
      }
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        setProfiles([]);
        setMode("NEW");
        setSelectedProfileId("");
        if (defaultPerson) {
          setNpRecipientLastName(defaultPerson.lastName ?? "");
          setNpRecipientFirstName(defaultPerson.firstName ?? "");
          setNpRecipientMiddleName("");
          setNpRecipientPhone(defaultPerson.phone ?? "");
        }
        return;
      }

      const msg =
        (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data
          ?.message ??
        (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data
          ?.error ??
        (e instanceof Error ? e.message : "Failed to load profiles");

      setProfiles([]);
      setMode("NEW");
      setSelectedProfileId("");
      if (defaultPerson) {
        setNpRecipientFirstName(defaultPerson.firstName ?? "");
        setNpRecipientLastName(defaultPerson.lastName ?? "");
        setNpRecipientPhone(defaultPerson.phone ?? "");
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [contactId, defaultPerson]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    resetNewForm();
    void loadProfiles();
  }, [open, loadProfiles, resetNewForm]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (canClose) onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, canClose, onClose]);

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );

  const validateNew = () => {
    if (recipientType === "PERSON") {
      if (!npRecipientLastName.trim() || !npRecipientFirstName.trim()) return "Вкажіть прізвище та ім'я отримувача";
      if (!npRecipientPhone.trim()) return "Вкажіть телефон отримувача";
    } else {
      if (!npCompanyName.trim()) return "Вкажіть назву компанії";
      if (!npEdrpou.trim()) return "Вкажіть ЄДРПОУ";
      if (!npContactPersonFirstName.trim()) return "Вкажіть ім'я контактної особи";
      if (!npContactPersonLastName.trim()) return "Вкажіть прізвище контактної особи";
      if (!npContactPersonPhone.trim()) return "Вкажіть телефон контактної особи";
    }

    if (!cityRef.trim()) return "Оберіть місто";

    if (deliveryType === "ADDRESS") {
      if (!streetRef.trim()) return "Оберіть вулицю";
      if (!building.trim()) return "Вкажіть номер будинку";
      return null;
    }

    if (!warehouseRef.trim()) return "Оберіть відділення або поштомат";
    return null;
  };

  const handleCreate = async () => {
    setError(null);

    if (!orderId) {
      setError("orderId is missing");
      return;
    }
    if (!contactId) {
      setError("contactId is missing (order.contactId required for TTN)");
      return;
    }

    const createPath = `/orders/${orderId}/np/ttn`;

    if (mode === "EXISTING") {
      if (!selectedProfileId?.trim()) {
        setError("Оберіть збережену адресу");
        return;
      }

      setCreating(true);
      try {
        const res = await apiHttp.post(createPath, { profileId: selectedProfileId.trim() });
        onCreated?.(res.data);
        onClose();
      } catch (e) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (e instanceof Error ? e.message : "Failed to create TTN");
        setError(msg);
      } finally {
        setCreating(false);
      }
      return;
    }

    const err = validateNew();
    if (err) {
      setError(err);
      return;
    }

    setCreating(true);
    try {
      let fn = "", ln = "", mn = "", ph = "";
      let cn = "", ed = "", cfn = "", cln = "", cph = "";

      if (recipientType === "PERSON") {
        fn = npRecipientFirstName.trim();
        ln = npRecipientLastName.trim();
        mn = npRecipientMiddleName.trim();
        ph = npRecipientPhone.trim();
      } else {
        cn = npCompanyName.trim();
        ed = npEdrpou.trim();
        cfn = npContactPersonFirstName.trim();
        cln = npContactPersonLastName.trim();
        cph = npContactPersonPhone.trim();
      }

      const payload = {
        saveAsProfile: !!saveToContact,
        profileLabel: label?.trim() || undefined,
        draft: {
          recipientType,
          deliveryType,

          firstName: fn || undefined,
          lastName: ln || undefined,
          middleName: mn || undefined,
          phone: ph || undefined,

          companyName: cn || undefined,
          edrpou: ed || undefined,
          contactPersonFirstName: cfn || undefined,
          contactPersonLastName: cln || undefined,
          contactPersonPhone: cph || undefined,

          cityRef: cityRef.trim(),
          cityName: cityName.trim() || undefined,

          ...(deliveryType === "ADDRESS"
            ? {
                streetRef: streetRef.trim(),
                streetName: streetName.trim() || undefined,
                building: building.trim(),
                flat: flat.trim() || undefined,
              }
            : {
                warehouseRef: warehouseRef.trim(),
                warehouseNumber: warehouseNumber.trim() || undefined,
              }),
        },
      };

      const res = await apiHttp.post(createPath, payload);
      onCreated?.(res.data);
      onClose();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Failed to create TTN");
      setError(msg);
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  const profileLabelText =
    selectedProfile?.label?.trim() ||
    (selectedProfile
      ? `${selectedProfile.firstName ?? ""} ${selectedProfile.lastName ?? ""} • ${selectedProfile.phone ?? ""}`.trim()
      : "");

  const previewAddress = (() => {
    if (!selectedProfile) return <span className="font-normal text-zinc-400">Не вибрано</span>;

    if (selectedProfile.deliveryType === "ADDRESS") {
      const parts = [
        selectedProfile.streetName || selectedProfile.streetRef || "",
        selectedProfile.building || "",
        selectedProfile.flat ? `кв ${selectedProfile.flat}` : "",
      ]
        .filter(Boolean)
        .join(", ");
      return parts || <span className="font-normal text-zinc-400">Не вибрано</span>;
    }

    const wh = [
      selectedProfile.warehouseType ? `${selectedProfile.warehouseType}` : "",
      selectedProfile.warehouseNumber ? `№${selectedProfile.warehouseNumber}` : "",
      selectedProfile.warehouseRef ? `(${selectedProfile.warehouseRef.slice(0, 8)}…)` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return wh || <span className="font-normal text-zinc-400">Не вибрано</span>;
  })();

  const inputClass = "mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm"
      onClick={() => {
        if (canClose) onClose();
      }}
      role="presentation"
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 flex-shrink-0">
          <div>
            <div className="text-sm text-zinc-500">Nova Poshta</div>
            <div className="text-lg font-semibold text-zinc-900">Створити ТТН</div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (canClose) onClose();
            }}
            className="rounded-md border border-zinc-200 px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            disabled={!canClose}
          >
            Закрити
          </button>
        </div>

        <div className="px-6 py-4 overflow-auto flex-1">
          {error ? <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

          <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex gap-4">
              <label className="flex cursor-pointer items-center gap-2" htmlFor="np-mode-profile">
                <input
                  id="np-mode-profile"
                  type="radio"
                  name="npMode"
                  checked={mode === "EXISTING"}
                  onChange={() => setMode("EXISTING")}
                  className="h-4 w-4 flex-shrink-0"
                  disabled={loading}
                />
                <span className="text-sm">Збережена адреса</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2" htmlFor="np-mode-new">
                <input
                  id="np-mode-new"
                  type="radio"
                  name="npMode"
                  checked={mode === "NEW"}
                  onChange={() => setMode("NEW")}
                  className="h-4 w-4 flex-shrink-0"
                  disabled={loading}
                />
                <span className="text-sm">Новий профіль</span>
              </label>
            </div>
            {loading && <div className="text-xs text-zinc-500">Завантаження…</div>}
          </div>

          {mode === "EXISTING" ? (
            <div className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <h3 className="text-sm font-medium text-zinc-800">Адреса доставки Нова пошта</h3>
              {profiles.length === 0 ? (
                <div className="text-sm text-zinc-600">
                  Немає збережених профілів. Оберіть <b>Новий профіль</b>.
                </div>
              ) : (
                <>
                  <label className="block text-sm text-zinc-600">Оберіть адресу</label>
                  <select
                    value={selectedProfileId}
                    onChange={(e) => setSelectedProfileId(e.target.value)}
                    className={inputClass}
                  >
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {(p.label && p.label.trim()) ||
                          `${p.firstName ?? ""} ${p.lastName ?? ""} • ${p.phone ?? ""} • ${
                            p.cityName ?? p.cityRef ?? ""
                          }`.trim()}
                      </option>
                    ))}
                  </select>

                  {selectedProfile ? (
                    <div className="mt-2 rounded-lg border border-zinc-200 bg-white p-3 text-sm">
                      <div className="text-xs text-zinc-500">Попередній перегляд</div>
                      <div className="mt-1 font-medium text-zinc-900">{profileLabelText}</div>
                      <div className="mt-1 text-zinc-700">
                        {selectedProfile.deliveryType === "WAREHOUSE" && "Відділення"}
                        {selectedProfile.deliveryType === "POSTOMAT" && "Поштомат"}
                        {selectedProfile.deliveryType === "ADDRESS" && "Кур'єрська доставка"} •{" "}
                        {selectedProfile.cityName ?? selectedProfile.cityRef ?? <span className="font-normal text-zinc-400">Не вибрано</span>}
                      </div>
                      <div className="mt-1 text-zinc-700">{previewAddress}</div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-zinc-800">Нова адреса доставки</h3>
                <label className="flex items-center gap-2 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={saveToContact}
                    onChange={(e) => setSaveToContact(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Зберегти в контакт
                </label>
              </div>

              {saveToContact && (
                <div>
                  <label className="block text-sm text-zinc-600">Назва профілю (необов'язково)</label>
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    className={inputClass}
                    placeholder='Наприклад, "Дім", "Офіс"'
                  />
                </div>
              )}

              <div>
                <p className="mb-2 text-sm font-medium text-zinc-700">Тип отримувача</p>
                <div className="flex gap-4">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="npRecipientType"
                      checked={recipientType === "PERSON"}
                      onChange={() => setRecipientType("PERSON")}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">Фізична особа</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="npRecipientType"
                      checked={recipientType === "COMPANY"}
                      onChange={() => setRecipientType("COMPANY")}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">Організація</span>
                  </label>
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-zinc-700">Тип доставки</p>
                <div className="flex flex-wrap gap-3">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="npDeliveryType"
                      checked={deliveryType === "WAREHOUSE"}
                      onChange={() => {
                        setDeliveryType("WAREHOUSE");
                        setStreetRef("");
                        setStreetName("");
                      }}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">Відділення</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="npDeliveryType"
                      checked={deliveryType === "POSTOMAT"}
                      onChange={() => {
                        setDeliveryType("POSTOMAT");
                        setStreetRef("");
                        setStreetName("");
                      }}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">Поштомат</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="npDeliveryType"
                      checked={deliveryType === "ADDRESS"}
                      onChange={() => {
                        setDeliveryType("ADDRESS");
                        setWarehouseRef("");
                        setWarehouseLabel("");
                        setWarehouseNumber("");
                      }}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">Адреса</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm text-zinc-600">Місто *</label>
                <NpCitySelect
                  valueRef={cityRef}
                  valueLabel={cityName}
                  onChange={(ref, name) => {
                    setCityRef(ref);
                    setCityName(name);
                    setWarehouseRef("");
                    setWarehouseLabel("");
                    setWarehouseNumber("");
                    setStreetRef("");
                    setStreetName("");
                  }}
                  disabled={creating}
                  placeholder="Почніть вводити назву"
                />
              </div>

              {(deliveryType === "WAREHOUSE" || deliveryType === "POSTOMAT") && (
                <div>
                  <label className="block text-sm text-zinc-600">
                    {deliveryType === "POSTOMAT" ? "Поштомат *" : "Відділення *"}
                  </label>
                  <NpWarehouseSelect
                    key={deliveryType}
                    cityRef={cityRef}
                    type={deliveryType}
                    valueRef={warehouseRef}
                    valueLabel={warehouseLabel}
                    onChange={(ref, lbl, num) => {
                      setWarehouseRef(ref);
                      setWarehouseLabel(lbl);
                      setWarehouseNumber(num ?? "");
                    }}
                    disabled={creating}
                    placeholder={
                      cityRef
                        ? deliveryType === "POSTOMAT"
                          ? "Номер або назва поштомата"
                          : "Номер або назва відділення"
                        : "Спочатку оберіть місто"
                    }
                  />
                </div>
              )}

              {deliveryType === "ADDRESS" && (
                <>
                  <div>
                    <label className="block text-sm text-zinc-600">Вулиця *</label>
                    <NpStreetSelect
                      cityRef={cityRef}
                      valueRef={streetRef}
                      valueLabel={streetName}
                      onChange={(ref, name) => {
                        setStreetRef(ref);
                        setStreetName(name);
                      }}
                      disabled={creating || !cityRef}
                      placeholder="Мін. 3 символи"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-zinc-600">Номер будинку *</label>
                      <input
                        type="text"
                        value={building}
                        onChange={(e) => setBuilding(e.target.value)}
                        placeholder="1"
                        className={inputClass}
                        disabled={creating}
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-zinc-600">Квартира</label>
                      <input
                        type="text"
                        value={flat}
                        onChange={(e) => setFlat(e.target.value)}
                        placeholder="Необовʼязково"
                        className={inputClass}
                        disabled={creating}
                      />
                    </div>
                  </div>
                </>
              )}

              {recipientType === "PERSON" ? (
                <>
                  <div>
                    <label className="block text-sm text-zinc-600">Прізвище отримувача *</label>
                    <input
                      type="text"
                      value={npRecipientLastName}
                      onChange={(e) => setNpRecipientLastName(e.target.value)}
                      placeholder="Прізвище"
                      className={inputClass}
                      disabled={creating}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-zinc-600">Ім'я *</label>
                      <input
                        type="text"
                        value={npRecipientFirstName}
                        onChange={(e) => setNpRecipientFirstName(e.target.value)}
                        placeholder="Ім'я"
                        className={inputClass}
                        disabled={creating}
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-zinc-600">По батькові</label>
                      <input
                        type="text"
                        value={npRecipientMiddleName}
                        onChange={(e) => setNpRecipientMiddleName(e.target.value)}
                        placeholder="По батькові"
                        className={inputClass}
                        disabled={creating}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-600">Телефон отримувача *</label>
                    <input
                      type="tel"
                      value={npRecipientPhone}
                      onChange={(e) => setNpRecipientPhone(e.target.value)}
                      placeholder="0XXXXXXXXX"
                      className={inputClass}
                      disabled={creating}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm text-zinc-600">Назва компанії *</label>
                    <input
                      type="text"
                      value={npCompanyName}
                      onChange={(e) => setNpCompanyName(e.target.value)}
                      placeholder="ТОВ «Приклад»"
                      className={inputClass}
                      disabled={creating}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-600">ЄДРПОУ *</label>
                    <input
                      type="text"
                      value={npEdrpou}
                      onChange={(e) => setNpEdrpou(e.target.value)}
                      placeholder="12345678"
                      className={inputClass}
                      disabled={creating}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-600">ПІБ контактної особи *</label>
                    <input
                      type="text"
                      value={npContactPersonFirstName}
                      onChange={(e) => setNpContactPersonFirstName(e.target.value)}
                      placeholder="Ім'я"
                      className={inputClass}
                      disabled={creating}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-600">Прізвище контактної особи *</label>
                    <input
                      type="text"
                      value={npContactPersonLastName}
                      onChange={(e) => setNpContactPersonLastName(e.target.value)}
                      placeholder="Прізвище"
                      className={inputClass}
                      disabled={creating}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-600">Телефон контактної особи *</label>
                    <input
                      type="tel"
                      value={npContactPersonPhone}
                      onChange={(e) => setNpContactPersonPhone(e.target.value)}
                      placeholder="0XXXXXXXXX"
                      className={inputClass}
                      disabled={creating}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        
        <div className="mt-auto border-t border-zinc-200 px-6 py-4 flex justify-end gap-2 bg-white flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={!canClose}
            className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            Скасувати
          </button>

          <button
            type="button"
            onClick={handleCreate}
            disabled={
              creating ||
              loading ||
              (mode === "EXISTING" && (profiles.length === 0 || !selectedProfileId?.trim()))
            }
            className="btn-primary rounded-md px-3 py-2 text-sm"
          >
            {creating ? "Створення…" : "Створити ТТН"}
          </button>
        </div>
      </div>
    </div>
  );
}
