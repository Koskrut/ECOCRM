// apps/web/src/app/orders/TtnModal.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TtnStatusBadge } from "@/components/TtnStatusBadge";
import { apiHttp } from "../../lib/api/client";
import {
  NpShippingProfileFormFields,
  validateNpShippingProfileForm,
  type NpShippingProfileFormValues,
} from "@/components/np/NpShippingProfileFormFields";

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

type TtnDetailsResponse = {
  ok?: boolean;
  ttn?: {
    id: string;
    documentNumber: string;
    documentRef?: string | null;
    statusCode?: string | null;
    statusText?: string | null;
    cost?: number | null;
    shipmentId?: string | null;
    editable?: boolean;
    payerType?: string | null;
    paymentMethod?: string | null;
    recipient?: Record<string, unknown>;
  };
};

type Props = {
  apiBaseUrl: string; // usually "/api"
  open: boolean;
  onClose: () => void;

  orderId: string;

  // IMPORTANT: should be order.contactId (contact used for TTN)
  contactId: string;

  /** create (default) or edit existing TTN */
  dialogMode?: "create" | "edit";

  /** Target TTN when mode=edit (optional if only one TTN on order) */
  ttnId?: string;
  shipmentId?: string;

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
  dialogMode = "create",
  ttnId,
  shipmentId,
  defaultPerson,
  onCreated,
}: Props) {
  const isEdit = dialogMode === "edit";
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ttnMeta, setTtnMeta] = useState<{
    id: string;
    documentNumber: string;
    statusText?: string | null;
    statusCode?: string | null;
    editable: boolean;
  } | null>(null);
  const [duplicateChoice, setDuplicateChoice] = useState<{
    documentNumber: string;
    orderId: string;
    orderNumber?: string;
    recipientLabel?: string;
    shipmentId: string;
    mode: "EXISTING" | "NEW";
    existingPayload?: { profileId: string; payerType: "Recipient" | "Sender" };
    newPayload?: Record<string, unknown>;
  } | null>(null);
  const duplicateChoiceRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!duplicateChoice) return;
    duplicateChoiceRef.current?.focus();
  }, [duplicateChoice, orderId, duplicateChoiceRef]);

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
  const [npContactPersonMiddleName, setNpContactPersonMiddleName] = useState("");
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

  const [payerType, setPayerType] = useState<"Recipient" | "Sender">("Recipient");

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
    setNpContactPersonMiddleName("");
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
    setPayerType("Recipient");
  }, []);

  const applyRecipientToForm = useCallback((recipient: Record<string, unknown>) => {
    const rt = recipient.recipientType === "COMPANY" ? "COMPANY" : "PERSON";
    const dt =
      recipient.deliveryType === "ADDRESS"
        ? "ADDRESS"
        : recipient.deliveryType === "POSTOMAT"
          ? "POSTOMAT"
          : "WAREHOUSE";
    setRecipientType(rt);
    setDeliveryType(dt);
    setLabel(String(recipient.label ?? ""));
    setNpRecipientFirstName(String(recipient.firstName ?? ""));
    setNpRecipientLastName(String(recipient.lastName ?? ""));
    setNpRecipientMiddleName(String(recipient.middleName ?? ""));
    setNpRecipientPhone(String(recipient.phone ?? ""));
    setNpCompanyName(String(recipient.companyName ?? ""));
    setNpEdrpou(String(recipient.edrpou ?? ""));
    setNpContactPersonFirstName(String(recipient.contactPersonFirstName ?? ""));
    setNpContactPersonLastName(String(recipient.contactPersonLastName ?? ""));
    setNpContactPersonMiddleName(String(recipient.contactPersonMiddleName ?? ""));
    setNpContactPersonPhone(String(recipient.contactPersonPhone ?? ""));
    setCityRef(String(recipient.cityRef ?? ""));
    setCityName(String(recipient.cityName ?? ""));
    setWarehouseRef(String(recipient.warehouseRef ?? ""));
    setWarehouseNumber(String(recipient.warehouseNumber ?? ""));
    const whNum = String(recipient.warehouseNumber ?? "").trim();
    setWarehouseLabel(whNum ? `№${whNum}` : "");
    setStreetRef(String(recipient.streetRef ?? ""));
    setStreetName(String(recipient.streetName ?? ""));
    setBuilding(String(recipient.building ?? ""));
    setFlat(String(recipient.flat ?? ""));
  }, []);

  const loadTtnDetails = useCallback(async () => {
    const params = new URLSearchParams();
    if (ttnId?.trim()) params.set("ttnId", ttnId.trim());
    if (shipmentId?.trim()) params.set("shipmentId", shipmentId.trim());
    const qs = params.toString();
    const res = await apiHttp.get<TtnDetailsResponse>(
      `/orders/${orderId}/np/ttn${qs ? `?${qs}` : ""}`,
      { headers: { "Cache-Control": "no-store" } },
    );
    const data = res.data as TtnDetailsResponse & { data?: TtnDetailsResponse };
    const ttn = data.ttn ?? data.data?.ttn;
    if (!ttn) throw new Error("TTN details not found");
    setTtnMeta({
      id: ttn.id,
      documentNumber: ttn.documentNumber,
      statusText: ttn.statusText,
      statusCode: ttn.statusCode,
      editable: ttn.editable !== false,
    });
    const payer = String(ttn.payerType ?? "").trim();
    if (payer === "Sender" || payer === "Recipient") setPayerType(payer);
    if (ttn.recipient && typeof ttn.recipient === "object") {
      applyRecipientToForm(ttn.recipient);
      setMode("NEW");
      setSelectedProfileId("");
    }
    return ttn;
  }, [applyRecipientToForm, orderId, shipmentId, ttnId]);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!contactId?.trim()) {
        setProfiles([]);
        setMode("NEW");
        setSelectedProfileId("");
        setError(
          "У замовленні не обрано контакт (клієнта). Збережіть замовлення з обраним клієнтом — тоді з’являться збережені адреси Нова Пошта.",
        );
        return;
      }

      const res = await apiHttp.get<ProfilesResponse>(`/contacts/${contactId}/shipping-profiles`, {
        headers: { "Cache-Control": "no-store" },
      });

      const data = res.data;
      const dataRecord = data as Record<string, unknown>;
      const dataData = dataRecord?.data as Record<string, unknown> | undefined;
      const itemsArray =
        Array.isArray(data)
          ? data
          : Array.isArray(dataRecord?.items)
            ? (data as { items: NpShippingProfile[] }).items
            : Array.isArray(dataData?.items)
              ? (data as unknown as { data: { items: NpShippingProfile[] } }).data.items
              : Array.isArray(dataRecord?.data)
                ? (data as unknown as { data: NpShippingProfile[] }).data
                : [];
      const rawItems = itemsArray;
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
        setError(
          "Контакт не знайдено або немає доступу. Перевірте, що у замовленні обрано контакт (клієнта) — тоді збережені адреси Нова Пошта підтягнуться.",
        );
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
    setTtnMeta(null);
    setDuplicateChoice(null);
    resetNewForm();

    if (isEdit) {
      setLoading(true);
      void (async () => {
        try {
          await loadTtnDetails();
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Failed to load TTN";
          setError(msg);
        } finally {
          setLoading(false);
        }
      })();
      return;
    }

    void loadProfiles();
  }, [open, isEdit, loadProfiles, loadTtnDetails, resetNewForm]);

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

  const newFormValues: NpShippingProfileFormValues = {
    label,
    recipientType,
    deliveryType,

    lastName: npRecipientLastName,
    firstName: npRecipientFirstName,
    middleName: npRecipientMiddleName,
    phone: npRecipientPhone,

    companyName: npCompanyName,
    edrpou: npEdrpou,
    contactPersonLastName: npContactPersonLastName,
    contactPersonFirstName: npContactPersonFirstName,
    contactPersonMiddleName: npContactPersonMiddleName,
    contactPersonPhone: npContactPersonPhone,

    cityRef,
    cityName,

    warehouseRef,
    warehouseLabel,
    warehouseNumber,

    streetRef,
    streetName,
    building,
    flat,
  };

  const setNewFormPatch = (patch: Partial<NpShippingProfileFormValues>) => {
    if (patch.label !== undefined) setLabel(patch.label);
    if (patch.recipientType !== undefined) setRecipientType(patch.recipientType);
    if (patch.deliveryType !== undefined) setDeliveryType(patch.deliveryType);

    if (patch.lastName !== undefined) setNpRecipientLastName(patch.lastName);
    if (patch.firstName !== undefined) setNpRecipientFirstName(patch.firstName);
    if (patch.middleName !== undefined) setNpRecipientMiddleName(patch.middleName);
    if (patch.phone !== undefined) setNpRecipientPhone(patch.phone);

    if (patch.companyName !== undefined) setNpCompanyName(patch.companyName);
    if (patch.edrpou !== undefined) setNpEdrpou(patch.edrpou);
    if (patch.contactPersonFirstName !== undefined) setNpContactPersonFirstName(patch.contactPersonFirstName);
    if (patch.contactPersonLastName !== undefined) setNpContactPersonLastName(patch.contactPersonLastName);
    if (patch.contactPersonMiddleName !== undefined) setNpContactPersonMiddleName(patch.contactPersonMiddleName);
    if (patch.contactPersonPhone !== undefined) setNpContactPersonPhone(patch.contactPersonPhone);

    if (patch.cityRef !== undefined) setCityRef(patch.cityRef);
    if (patch.cityName !== undefined) setCityName(patch.cityName);

    if (patch.warehouseRef !== undefined) setWarehouseRef(patch.warehouseRef);
    if (patch.warehouseLabel !== undefined) setWarehouseLabel(patch.warehouseLabel);
    if (patch.warehouseNumber !== undefined) setWarehouseNumber(patch.warehouseNumber);

    if (patch.streetRef !== undefined) setStreetRef(patch.streetRef);
    if (patch.streetName !== undefined) setStreetName(patch.streetName);
    if (patch.building !== undefined) setBuilding(patch.building);
    if (patch.flat !== undefined) setFlat(patch.flat);
  };

  const validateNew = () => {
    return validateNpShippingProfileForm(newFormValues, { requireLabel: !!saveToContact });
  };

  const buildDraftPayload = () => ({
    saveAsProfile: !!saveToContact,
    profileLabel: newFormValues.label?.trim() || undefined,
    payerType,
    draft: {
      recipientType: newFormValues.recipientType,
      deliveryType: newFormValues.deliveryType,

      ...(newFormValues.recipientType === "PERSON"
        ? {
            firstName: newFormValues.firstName.trim() || undefined,
            lastName: newFormValues.lastName.trim() || undefined,
            middleName: newFormValues.middleName.trim() || undefined,
            phone: newFormValues.phone.trim() || undefined,
          }
        : {
            companyName: newFormValues.companyName.trim() || undefined,
            edrpou: newFormValues.edrpou.trim() || undefined,
            contactPersonFirstName: newFormValues.contactPersonFirstName.trim() || undefined,
            contactPersonLastName: newFormValues.contactPersonLastName.trim() || undefined,
            contactPersonMiddleName: newFormValues.contactPersonMiddleName.trim() || undefined,
            contactPersonPhone: newFormValues.contactPersonPhone.trim() || undefined,
          }),

      cityRef: newFormValues.cityRef.trim(),
      cityName: newFormValues.cityName.trim() || undefined,

      ...(newFormValues.deliveryType === "ADDRESS"
        ? {
            streetRef: newFormValues.streetRef.trim(),
            streetName: newFormValues.streetName.trim() || undefined,
            building: newFormValues.building.trim(),
            flat: newFormValues.flat.trim() || undefined,
          }
        : {
            warehouseRef: newFormValues.warehouseRef.trim(),
            warehouseNumber: newFormValues.warehouseNumber.trim() || undefined,
          }),
    },
  });

  const handleSave = async () => {
    setError(null);
    setDuplicateChoice(null);
    const getBackendErrorData = (err: unknown): Record<string, unknown> => {
      const fromAxiosStyle =
        ((err as { response?: { data?: Record<string, unknown> } })?.response?.data as
          | Record<string, unknown>
          | undefined) ?? null;
      if (fromAxiosStyle) return fromAxiosStyle;
      const fromMapped = (err as { details?: unknown })?.details;
      if (fromMapped && typeof fromMapped === "object") {
        return fromMapped as Record<string, unknown>;
      }
      return {};
    };

    if (!orderId) {
      setError("orderId is missing");
      return;
    }
    if (!contactId) {
      setError("contactId is missing (order.contactId required for TTN)");
      return;
    }

    const createPath = `/orders/${orderId}/np/ttn`;
    const query = new URLSearchParams();
    if (isEdit && ttnId?.trim()) query.set("ttnId", ttnId.trim());
    if (isEdit && shipmentId?.trim()) query.set("shipmentId", shipmentId.trim());
    const pathWithQuery = query.toString() ? `${createPath}?${query}` : createPath;

    if (isEdit) {
      if (ttnMeta && !ttnMeta.editable) {
        setError("ТТН уже відправлена — редагування недоступне");
        return;
      }
      const err = validateNew();
      if (err) {
        setError(err);
        return;
      }
      setCreating(true);
      try {
        const res = await apiHttp.patch(pathWithQuery, buildDraftPayload());
        onCreated?.(res.data);
        onClose();
      } catch (e) {
        const data = getBackendErrorData(e);
        const msg =
          String(data?.message ?? "") || (e instanceof Error ? e.message : "Failed to update TTN");
        setError(msg);
      } finally {
        setCreating(false);
      }
      return;
    }

    if (mode === "EXISTING") {
      if (!selectedProfileId?.trim()) {
        setError("Оберіть збережену адресу");
        return;
      }

      setCreating(true);
      try {
        const res = await apiHttp.post(createPath, {
          profileId: selectedProfileId.trim(),
          payerType,
        });
        onCreated?.(res.data);
        onClose();
      } catch (e) {
        const data = getBackendErrorData(e);
        const code = String(data?.code ?? "");
        if (code === "DUPLICATE_UNSENT_TTN") {
          const duplicate = (data?.duplicate ?? {}) as Record<string, unknown>;
          const duplicateTtn = String(duplicate.documentNumber ?? "");
          const duplicateOrderId = String(duplicate.orderId ?? "");
          setDuplicateChoice({
            documentNumber: duplicateTtn,
            orderId: duplicateOrderId,
            orderNumber: String(duplicate.orderNumber ?? ""),
            recipientLabel: String(duplicate.recipientLabel ?? ""),
            shipmentId: String(duplicate.shipmentId ?? ""),
            mode: "EXISTING",
            existingPayload: { profileId: selectedProfileId.trim(), payerType },
          });
          return;
        }
        const msg =
          String(data?.message ?? "") ||
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

    let draftPayloadForDuplicate: Record<string, unknown> | null = null;
    setCreating(true);
    try {
      const payload = buildDraftPayload();
      draftPayloadForDuplicate = payload as Record<string, unknown>;

      const res = await apiHttp.post(createPath, payload);
      onCreated?.(res.data);
      onClose();
    } catch (e) {
      const data = getBackendErrorData(e);
      const code = String(data?.code ?? "");
      if (code === "DUPLICATE_UNSENT_TTN") {
        const duplicate = (data?.duplicate ?? {}) as Record<string, unknown>;
        const duplicateTtn = String(duplicate.documentNumber ?? "");
        const duplicateOrderId = String(duplicate.orderId ?? "");
        setDuplicateChoice({
          documentNumber: duplicateTtn,
          orderId: duplicateOrderId,
          orderNumber: String(duplicate.orderNumber ?? ""),
          recipientLabel: String(duplicate.recipientLabel ?? ""),
          shipmentId: String(duplicate.shipmentId ?? ""),
          mode: "NEW",
          newPayload: draftPayloadForDuplicate ?? undefined,
        });
        return;
      }
      const msg =
        String(data?.message ?? "") ||
        (e instanceof Error ? e.message : "Failed to create TTN");
      setError(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleDuplicateReuse = async () => {
    if (!duplicateChoice) return;
    setCreating(true);
    setError(null);
    try {
      await apiHttp.post(`/orders/${orderId}/np/ttn/reuse-existing`, {
        sourceShipmentId: duplicateChoice.shipmentId || null,
        sourceDocumentNumber: duplicateChoice.documentNumber || null,
      });
      onCreated?.(null);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reuse existing TTN");
    } finally {
      setCreating(false);
    }
  };

  const handleDuplicateCreateNew = async () => {
    if (!duplicateChoice) return;
    const createPath = `/orders/${orderId}/np/ttn`;
    setCreating(true);
    setError(null);
    try {
      const body =
        duplicateChoice.mode === "EXISTING"
          ? { ...(duplicateChoice.existingPayload ?? {}), ignoreDuplicateCheck: true }
          : { ...(duplicateChoice.newPayload ?? {}), ignoreDuplicateCheck: true };
      const res = await apiHttp.post(createPath, body);
      onCreated?.(res.data);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create TTN");
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  const readOnly = isEdit && ttnMeta != null && !ttnMeta.editable;
  const modalTitle = isEdit
    ? ttnMeta?.documentNumber
      ? `ТТН №${ttnMeta.documentNumber}`
      : "ТТН"
    : "Створити ТТН";

  const profileLabelText =
    selectedProfile?.label?.trim() ||
    (selectedProfile
      ? `${selectedProfile.lastName ?? ""} ${selectedProfile.firstName ?? ""} • ${selectedProfile.phone ?? ""}`.trim()
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

    const number = selectedProfile.warehouseNumber?.trim();
    return number ? `№${number}` : <span className="font-normal text-zinc-400">Не вибрано</span>;
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
            <div className="text-lg font-semibold text-zinc-900">{modalTitle}</div>
            {isEdit && (ttnMeta?.statusText || ttnMeta?.statusCode) ? (
              <div className="mt-1">
                <TtnStatusBadge
                  statusCode={ttnMeta?.statusCode}
                  statusText={ttnMeta?.statusText}
                  size="md"
                />
              </div>
            ) : null}
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
          {readOnly ? (
            <div className="mb-3 rounded-lg bg-zinc-100 p-3 text-sm text-zinc-700">
              ТТН уже відправлена або доставлена — перегляд доступний, редагування вимкнено.
            </div>
          ) : null}
          {!isEdit && duplicateChoice ? (
            <div
              className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
              tabIndex={-1}
              ref={(el) => {
                duplicateChoiceRef.current = el;
              }}
            >
              <div>
                Знайдено незавершену ТТН №{duplicateChoice.documentNumber || "?"} у замовленні{" "}
                {duplicateChoice.orderNumber?.trim() || duplicateChoice.orderId || "?"}
                {duplicateChoice.recipientLabel?.trim()
                  ? ` (отримувач: ${duplicateChoice.recipientLabel.trim()})`
                  : ""}
                . Оберіть дію:
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleDuplicateReuse}
                  disabled={creating}
                  className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm hover:bg-amber-100 disabled:opacity-50"
                >
                  Підставити існуючу ТТН
                </button>
                <button
                  type="button"
                  onClick={handleDuplicateCreateNew}
                  disabled={creating}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50"
                >
                  Створити нову ТТН
                </button>
                <button
                  type="button"
                  onClick={() => setDuplicateChoice(null)}
                  disabled={creating}
                  className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Скасувати
                </button>
              </div>
            </div>
          ) : null}

          {!isEdit ? (
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
          ) : null}

          <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <span className="text-sm font-medium text-zinc-700">Плательщик</span>
            <div className="flex gap-4">
              <label className="flex cursor-pointer items-center gap-2" htmlFor="np-payer-recipient">
                <input
                  id="np-payer-recipient"
                  type="radio"
                  name="npPayer"
                  checked={payerType === "Recipient"}
                  onChange={() => setPayerType("Recipient")}
                  className="h-4 w-4 flex-shrink-0"
                  disabled={readOnly || loading}
                />
                <span className="text-sm">Отримувач</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2" htmlFor="np-payer-sender">
                <input
                  id="np-payer-sender"
                  type="radio"
                  name="npPayer"
                  checked={payerType === "Sender"}
                  onChange={() => setPayerType("Sender")}
                  className="h-4 w-4 flex-shrink-0"
                  disabled={readOnly || loading}
                />
                <span className="text-sm">Відправник</span>
              </label>
            </div>
          </div>

          {!isEdit && mode === "EXISTING" ? (
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
                          `${p.lastName ?? ""} ${p.firstName ?? ""} • ${p.phone ?? ""} • ${
                            p.cityName ?? p.cityRef ?? ""
                          }`.trim()}
                      </option>
                    ))}
                  </select>

                  {selectedProfile ? (
                    <div className="mt-2 rounded-lg border border-zinc-200 bg-white p-3 text-sm">
                      <div className="text-xs text-zinc-500">Попередній перегляд</div>
                      {(() => {
                        const lbl = selectedProfile.label?.trim();
                        const isRedundantLabel =
                          lbl === "Поштомат" ||
                          lbl === "Відділення" ||
                          lbl === "Кур'єрська доставка";
                        return lbl && !isRedundantLabel ? (
                          <div className="mt-1 font-medium text-zinc-900">{lbl}</div>
                        ) : null;
                      })()}
                      <div className="mt-1 text-zinc-700">
                        <span className="text-zinc-500">Отримувач:</span>{" "}
                        {[selectedProfile.lastName, selectedProfile.firstName].filter(Boolean).join(" ") || (
                          <span className="font-normal text-zinc-400">—</span>
                        )}
                      </div>
                      <div className="mt-1 text-zinc-700">
                        <span className="text-zinc-500">Телефон:</span>{" "}
                        {selectedProfile.phone?.trim() || (
                          <span className="font-normal text-zinc-400">—</span>
                        )}
                      </div>
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
              <NpShippingProfileFormFields
                disabled={creating || readOnly || loading}
                requireLabel={false}
                values={newFormValues}
                onChange={setNewFormPatch}
                showSaveToContact
                saveToContact={saveToContact}
                onSaveToContactChange={(next) => setSaveToContact(next)}
              />
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

          {!readOnly ? (
            <button
              type="button"
              onClick={handleSave}
              disabled={
                creating ||
                loading ||
                (!isEdit && !!duplicateChoice) ||
                (!isEdit && mode === "EXISTING" && (profiles.length === 0 || !selectedProfileId?.trim()))
              }
              className="btn-primary rounded-md px-3 py-2 text-sm"
            >
              {creating
                ? isEdit
                  ? "Збереження…"
                  : "Створення…"
                : isEdit
                  ? "Зберегти зміни"
                  : "Створити ТТН"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
