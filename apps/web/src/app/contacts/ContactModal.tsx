"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EntityModalShell } from "@/components/modals/EntityModalShell";
import { EntitySection } from "@/components/sections/EntitySection";
import { CustomFieldsPanel } from "@/components/metadata/CustomFieldsPanel";
import { scheduleModalClose } from "@/lib/modal/scheduleModalClose";
import { OrderModal } from "../orders/OrderModal";
import { ReturnModal } from "../orders/ReturnModal";
import { ContactOrdersPanel } from "./card/ContactOrdersPanel";
import { strings } from "@/locales";
import { apiHttp } from "../../lib/api/client";
import type { MeResponse } from "@/lib/api/resources/auth";
import { companiesApi } from "@/lib/api/resources/companies";
import { contactsApi } from "@/lib/api/resources/contacts";
import { formatPhoneInputMask } from "@/lib/formatPhone";
import { ContactCreateForm, type ContactCreateFormValues } from "./ContactCreateForm";
import { useContactPhoneDuplicateCheck } from "./useContactPhoneDuplicateCheck";
import { visitsApi } from "@/lib/api";
import { manualCallingApi } from "@/lib/api/resources/manual-calling";
import { ContactCardSkeleton } from "./card/ContactCardSkeleton";
import { ContactKpiStrip } from "./card/ContactKpiStrip";
import { pickVisitReadyAddresses } from "@/components/EntityAddressesSection";
import {
  buildVisitLocationCreatePayload,
  defaultVisitLocationFromAddresses,
  visitLocationHasCoords,
  type VisitLocationValue,
} from "@/lib/visits/visit-location.types";
import { useContactCardSummary } from "./card/useContactCardSummary";
import { useContactInsights } from "./card/useContactInsights";
import { useModules } from "@/lib/modules/useModules";
import { ModuleIds } from "@/lib/modules/module-ids";
import {
  useContactCardAnalytics,
  type ContactCardAnalyticsRange,
  type ContactCardAnalyticsScope,
} from "./card/useContactCardAnalytics";
import {
  badgesFromSummary,
  useContactCardShellHeader,
} from "./card/ContactCardShellHeader";
import { ContactWorkPanel } from "./card/ContactWorkPanel";
import { ContactVisitPlanner } from "./card/ContactVisitPlanner";
import { ContactIdentityFields } from "./card/ContactIdentityFields";
import { ContactActivityTab } from "./card/ContactActivityTab";
import { ContactFinanceTab } from "./card/ContactFinanceTab";
import { ContactProfileTab } from "./card/ContactProfileTab";
import { ContactDeliveryProfilesTab } from "./card/ContactDeliveryProfilesTab";
import {
  toDateTimeLocalValue,
  type ContactCardTabId,
  type ContactModalContact,
} from "./card/contact-modal.types";

function buildStoreThankYouSetPasswordUrl(publicStoreBase: string, setPasswordToken: string): string {
  const base = publicStoreBase.trim().replace(/\/+$/, "");
  const withScheme = /^https?:\/\//i.test(base) ? base : `https://${base}`;
  const u = new URL("/thank-you", withScheme);
  u.searchParams.set("setPasswordToken", setPasswordToken);
  return u.href;
}

export type ContactCreateInitial = {
  companyId?: string | null;
  phone?: string;
  firstName?: string;
  lastName?: string;
};

type Props = {
  apiBaseUrl: string;
  contactId: string;
  onClose: () => void;
  onUpdate: () => void;
  onCreated?: (id: string) => void;
  initialCreate?: ContactCreateInitial;
  onOpenCompany?: (id: string) => void;
  onOpenOrder?: (id: string) => void;
  onOpenReturn?: (id: string) => void;
  userRole?: string | null;
  zIndex?: number;
  /** Bumps the orders list when a stacked order/return is saved outside this modal. */
  externalOrdersReloadKey?: number;
};

export function ContactModal({
  apiBaseUrl,
  contactId,
  onClose,
  onUpdate,
  onCreated,
  initialCreate,
  onOpenCompany,
  onOpenOrder,
  onOpenReturn,
  userRole: userRoleProp,
  zIndex,
  externalOrdersReloadKey,
}: Props) {
  const [savedContactId, setSavedContactId] = useState<string | null>(null);
  const [justSavedBanner, setJustSavedBanner] = useState(false);
  const effectiveContactId = savedContactId ?? contactId;
  const isCreate = effectiveContactId === "new";
  const effectiveRole = userRoleProp ?? null;

  const [contact, setContact] = useState<ContactModalContact | null>(null);
  const [loading, setLoading] = useState(!isCreate);
  const [err, setErr] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [position, setPosition] = useState("");
  const [addressRequiredForVisit, setAddressRequiredForVisit] = useState(false);
  const [visitLocation, setVisitLocation] = useState<VisitLocationValue | null>(null);
  const [visitPurpose, setVisitPurpose] = useState("");
  const [visitStartsAt, setVisitStartsAt] = useState("");
  const [visitDurationMin, setVisitDurationMin] = useState("60");
  const [planningVisit, setPlanningVisit] = useState(false);
  const [visitPlanError, setVisitPlanError] = useState<string | null>(null);
  const [visitPlanSuccess, setVisitPlanSuccess] = useState<string | null>(null);
  const [mapsApiKey, setMapsApiKey] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [externalCode, setExternalCode] = useState("");
  const [documentDisplayName, setDocumentDisplayName] = useState("");
  const [region, setRegion] = useState("");
  const [clientType, setClientType] = useState("");
  const [status, setStatus] = useState("");
  const [nextActionType, setNextActionType] = useState("");
  const [nextActionAt, setNextActionAt] = useState("");
  const [nextActionNote, setNextActionNote] = useState("");
  const [savingNextAction, setSavingNextAction] = useState(false);
  const [nextActionError, setNextActionError] = useState<string | null>(null);
  const [nextActionSuccess, setNextActionSuccess] = useState<string | null>(null);
  const [clientStage, setClientStage] = useState("");
  const [savingStage, setSavingStage] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);
  const [stageSuccess, setStageSuccess] = useState<string | null>(null);

  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<{ id: string; name: string } | null>(null);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const companySearchSeqRef = useRef(0);
  const [users, setUsers] = useState<{ id: string; fullName: string; email: string }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [orderId, setOrderId] = useState<string | null>(null);
  const [returnId, setReturnId] = useState<string | null>(null);
  const usesExternalOrders = Boolean(onOpenOrder);
  const usesExternalReturns = Boolean(onOpenReturn);
  const openOrder = onOpenOrder ?? setOrderId;
  const openReturn = onOpenReturn ?? setReturnId;
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [ordersReloadKey, setOrdersReloadKey] = useState(0);
  const mergedOrdersReloadKey = ordersReloadKey + (externalOrdersReloadKey ?? 0);

  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [queueingDialer, setQueueingDialer] = useState(false);
  const [resetPasswordResult, setResetPasswordResult] = useState<{
    tempPassword: string;
    setPasswordToken: string;
  } | null>(null);
  const [resetPasswordPublicStoreBase, setResetPasswordPublicStoreBase] = useState<string | null>(null);
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);

  const resetPasswordFullUrl = useMemo(() => {
    if (!resetPasswordResult || !resetPasswordPublicStoreBase) return null;
    return buildStoreThankYouSetPasswordUrl(
      resetPasswordPublicStoreBase,
      resetPasswordResult.setPasswordToken,
    );
  }, [resetPasswordResult, resetPasswordPublicStoreBase]);

  const closeResetPasswordDialog = useCallback(() => {
    setResetPasswordError(null);
    setResetPasswordResult(null);
    setResetPasswordPublicStoreBase(null);
  }, []);

  const [leftTab, setLeftTab] = useState<ContactCardTabId>("overview");

  const { status: modulesStatus, effective: moduleEffective } = useModules();
  const financeModuleEnabled =
    modulesStatus === "ready" && moduleEffective(ModuleIds.Finance);

  useEffect(() => {
    if (!financeModuleEnabled && leftTab === "finance") {
      setLeftTab("overview");
    }
  }, [financeModuleEnabled, leftTab]);

  const phoneDuplicate = useContactPhoneDuplicateCheck(phone, isCreate);

  const cardSummary = useContactCardSummary(effectiveContactId, !isCreate);
  const contactInsights = useContactInsights(effectiveContactId, !isCreate && leftTab === "overview");
  const [analyticsRange, setAnalyticsRange] = useState<ContactCardAnalyticsRange>("30d");
  const [analyticsScope, setAnalyticsScope] = useState<ContactCardAnalyticsScope>("contact");
  const cardAnalytics = useContactCardAnalytics(effectiveContactId, {
    range: analyticsRange,
    scope: analyticsScope,
    enabled: !isCreate && leftTab === "finance",
  });
  useEffect(() => {
    if (!contact?.companyId && analyticsScope === "company") {
      setAnalyticsScope("contact");
    }
  }, [contact?.companyId, analyticsScope]);

  const cancelInlineEditRef = useRef<(() => void) | null>(null);
  const canClose = !saving;

  const fullName = useMemo(() => {
    if (isCreate) {
      const name = `${lastName.trim()} ${firstName.trim()}`.trim();
      return name || strings.contacts.create.title;
    }
    const a = (contact?.firstName ?? "").trim();
    const b = (contact?.lastName ?? "").trim();
    return `${a} ${b}`.trim() || "Contact";
  }, [isCreate, firstName, lastName, contact?.firstName, contact?.lastName]);

  const visitReadyAddresses = useMemo(
    () => pickVisitReadyAddresses(contact?.addresses ?? []),
    [contact?.addresses],
  );

  useEffect(() => {
    void apiHttp
      .get<{ mapsApiKey?: string | null }>("/settings/google-maps/public")
      .then((res) => setMapsApiKey(res.data?.mapsApiKey ?? null))
      .catch(() => setMapsApiKey(null));
  }, []);

  useEffect(() => {
    setVisitLocation((prev) => {
      if (prev && visitLocationHasCoords(prev)) {
        if (prev.mode === "entity" && visitReadyAddresses.some((a) => a.id === prev.addressId)) {
          return prev;
        }
        if (prev.mode === "other") return prev;
      }
      return defaultVisitLocationFromAddresses(visitReadyAddresses);
    });
  }, [visitReadyAddresses]);

  const searchCompanies = useCallback(async (query: string) => {
    const seq = ++companySearchSeqRef.current;
    setLoadingCompanies(true);
    try {
      const res = await companiesApi.list({
        search: query.trim() || undefined,
        page: 1,
        pageSize: 50,
      });
      if (seq !== companySearchSeqRef.current) return;
      setCompanies(
        (res.items ?? []).map((c) => ({ id: String(c.id), name: c.name })),
      );
    } catch {
      if (seq !== companySearchSeqRef.current) return;
      setCompanies([]);
    } finally {
      if (seq === companySearchSeqRef.current) setLoadingCompanies(false);
    }
  }, []);

  const onCompanySearchQueryChange = useCallback(
    (q: string) => {
      void searchCompanies(q);
    },
    [searchCompanies],
  );

  const rememberSelectedCompany = useCallback((id: string | null, name?: string) => {
    if (!id) {
      setSelectedCompany(null);
      return;
    }
    if (name) {
      setSelectedCompany({ id, name });
      return;
    }
    setSelectedCompany((prev) => (prev?.id === id ? prev : null));
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await apiHttp.get<{ items?: { id: string; fullName: string; email: string }[] }>(
        "/users",
      );
      setUsers(Array.isArray(res.data?.items) ? res.data.items : []);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    setSavedContactId(null);
    setJustSavedBanner(false);
  }, [contactId]);

  const refresh = useCallback(
    async (overrideId?: string) => {
      const targetId = overrideId ?? effectiveContactId;
      if (targetId === "new") return;
      setLoading(true);
      setErr(null);
      try {
        const res = await apiHttp.get<ContactModalContact>(`/contacts/${targetId}`);
        const data = res.data;
        setContact(data);
        setFirstName(data.firstName ?? "");
        setLastName(data.lastName ?? "");
        setPhone(data.phone ?? "");
        setEmail((data.email ?? "") as string);
        setPosition((data.position ?? "") as string);
        setOwnerId(data.ownerId != null ? String(data.ownerId) : null);
        setCompanyId(data.companyId != null ? String(data.companyId) : null);
        setSelectedCompany(
          data.companyId && data.company?.name
            ? { id: String(data.companyId), name: data.company.name }
            : null,
        );
        setExternalCode((data.externalCode ?? "") as string);
        setDocumentDisplayName((data.documentDisplayName ?? "") as string);
        setRegion((data.region ?? "") as string);
        setClientType((data.clientType ?? "") as string);
        setStatus((data.status ?? "") as string);
        setNextActionType((data.nextActionType ?? "") as string);
        setNextActionAt(toDateTimeLocalValue(data.nextActionAt));
        setNextActionNote((data.nextActionNote ?? "") as string);
        setClientStage((data.clientStage ?? "") as string);
        setNextActionError(null);
        setNextActionSuccess(null);
        setStageError(null);
        setStageSuccess(null);
        await fetchUsers();
      } catch (e) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (e instanceof Error ? e.message : "Не вдалося завантажити контакт");
        setContact(null);
        setErr(msg);
      } finally {
        setLoading(false);
      }
    },
    [effectiveContactId, fetchUsers],
  );

  useEffect(() => {
    setErr(null);
    setContact(null);
    setOrderId(null);
    setReturnId(null);
    setLeftTab("overview");
    if (isCreate) {
      setLoading(false);
      setFirstName(initialCreate?.firstName ?? "");
      setLastName(initialCreate?.lastName ?? "");
      setPhone(initialCreate?.phone ? formatPhoneInputMask(initialCreate.phone) : "");
      setEmail("");
      setPosition("");
      setOwnerId(null);
      void apiHttp
        .get<MeResponse>("/auth/me")
        .then((res) => {
          const uid = res.data?.user?.id;
          if (uid) setOwnerId(String(uid));
        })
        .catch(() => {});
      setCompanyId(initialCreate?.companyId ?? null);
      setSelectedCompany(null);
      setCompanies([]);
      if (initialCreate?.companyId) {
        void companiesApi
          .get(initialCreate.companyId)
          .then((c) => setSelectedCompany({ id: String(c.id), name: c.name }))
          .catch(() => {});
      }
      setExternalCode("");
      setRegion("");
      setClientType("");
      setStatus("");
      setNextActionType("");
      setNextActionAt("");
      setNextActionNote("");
      setClientStage("");
      setNextActionError(null);
      setNextActionSuccess(null);
      setStageError(null);
      setStageSuccess(null);
      void fetchUsers();
      return;
    }
    void refresh();
  }, [isCreate, refresh, fetchUsers, initialCreate]);

  const patchContact = useCallback(
    async (payload: Record<string, unknown>) => {
      const res = await apiHttp.patch<ContactModalContact>(`/contacts/${effectiveContactId}`, payload);
      const data = res.data;
      setContact((prev) =>
        prev
          ? {
              ...data,
              phones: data.phones ?? prev.phones ?? [],
              addresses: data.addresses ?? prev.addresses ?? [],
            }
          : data,
      );
      if (payload.firstName !== undefined) setFirstName(String(payload.firstName));
      if (payload.lastName !== undefined) setLastName(String(payload.lastName));
      if (payload.phone !== undefined) setPhone(String(payload.phone));
      if (payload.email !== undefined) setEmail((payload.email as string | null) ?? "");
      if (payload.position !== undefined) setPosition((payload.position as string | null) ?? "");
      if (payload.region !== undefined) setRegion((payload.region as string | null) ?? "");
      if (payload.clientType !== undefined) setClientType((payload.clientType as string | null) ?? "");
      if (payload.status !== undefined) setStatus((payload.status as string | null) ?? "");
      if (payload.ownerId !== undefined) {
        setOwnerId(payload.ownerId != null ? String(payload.ownerId) : null);
      }
      if (payload.companyId !== undefined) {
        const nextId = payload.companyId != null ? String(payload.companyId) : null;
        setCompanyId(nextId);
        if (!nextId) setSelectedCompany(null);
      }
      if (payload.externalCode !== undefined) {
        setExternalCode((payload.externalCode as string | null) ?? "");
      }
      if (payload.documentDisplayName !== undefined) {
        setDocumentDisplayName((payload.documentDisplayName as string | null) ?? "");
      }
      onUpdate();
      void cardSummary.refetch();
    },
    [cardSummary, effectiveContactId, onUpdate],
  );

  const handleEscape = useCallback(() => {
    if (cancelInlineEditRef.current) {
      cancelInlineEditRef.current();
      cancelInlineEditRef.current = null;
      return true;
    }
    if (!usesExternalReturns && returnId) {
      setReturnId(null);
      return true;
    }
    if (!usesExternalOrders && orderId) {
      setOrderId(null);
      return true;
    }
    return false;
  }, [orderId, returnId, usesExternalOrders, usesExternalReturns]);

  const saveCreate = async (opts?: { closeAfter?: boolean }) => {
    const closeAfter = opts?.closeAfter ?? false;
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        position: position.trim() || null,
        externalCode: externalCode.trim() || null,
        region: region.trim() || null,
        clientType: clientType.trim() || null,
        status: status.trim() || null,
        ownerId: ownerId || null,
        companyId: companyId || null,
      };
      const requiredMsg = (label: string) =>
        `${label} — ${strings.contacts.create.fieldRequired}`;
      if (!payload.firstName) throw new Error(requiredMsg(strings.contacts.create.firstName));
      if (!payload.lastName) throw new Error(requiredMsg(strings.contacts.create.lastName));
      if (!payload.phone) throw new Error(requiredMsg(strings.contacts.create.phone));
      if (!payload.region) throw new Error(requiredMsg(strings.contacts.create.region));
      const res = await apiHttp.post<ContactModalContact>("/contacts", payload);
      const id = res.data?.id;
      if (!id) throw new Error("Не вдалося створити контакт");
      setSavedContactId(id);
      onCreated?.(id);
      onUpdate();
      if (closeAfter) {
        onClose();
        return;
      }
      setJustSavedBanner(true);
      await refresh(id);
    } catch (e) {
      const statusCode = (e as { response?: { status?: number } })?.response?.status;
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Помилка");
      setErr(statusCode === 409 ? strings.contacts.create.duplicateMessage : msg);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateFieldChange = useCallback(
    <K extends keyof ContactCreateFormValues>(key: K, value: ContactCreateFormValues[K]) => {
      switch (key) {
        case "firstName":
          setFirstName(value as string);
          break;
        case "lastName":
          setLastName(value as string);
          break;
        case "phone":
          setPhone(value as string);
          break;
        case "email":
          setEmail(value as string);
          break;
        case "position":
          setPosition(value as string);
          break;
        case "externalCode":
          setExternalCode(value as string);
          break;
        case "region":
          setRegion(value as string);
          break;
        case "clientType":
          setClientType(value as string);
          break;
        case "status":
          setStatus(value as string);
          break;
        case "companyId": {
          const nextId = value as string | null;
          setCompanyId(nextId);
          if (!nextId) setSelectedCompany(null);
          break;
        }
        case "ownerId":
          setOwnerId(value as string | null);
          break;
        default:
          break;
      }
    },
    [],
  );

  const createFormValues: ContactCreateFormValues = useMemo(
    () => ({
      firstName,
      lastName,
      phone,
      email,
      position,
      externalCode,
      region,
      clientType,
      status,
      companyId,
      ownerId,
    }),
    [
      firstName,
      lastName,
      phone,
      email,
      position,
      externalCode,
      region,
      clientType,
      status,
      companyId,
      ownerId,
    ],
  );

  const createDirty = useMemo(() => {
    if (!isCreate) return false;
    return Boolean(
      firstName.trim() ||
        lastName.trim() ||
        phone.trim() ||
        email.trim() ||
        position.trim() ||
        externalCode.trim() ||
        region.trim() ||
        clientType.trim() ||
        status.trim() ||
        companyId ||
        ownerId,
    );
  }, [
    isCreate,
    firstName,
    lastName,
    phone,
    email,
    position,
    externalCode,
    region,
    clientType,
    status,
    companyId,
    ownerId,
  ]);

  const handleCloseCreate = useCallback(() => {
    if (createDirty && !window.confirm(strings.contacts.create.discardConfirm)) return;
    onClose();
  }, [createDirty, onClose]);

  const scheduleVisit = useCallback(async () => {
    if (!contact) {
      alert(strings.contacts.card.saveContactFirst);
      return;
    }
    if (!visitLocation || !visitLocationHasCoords(visitLocation)) {
      setAddressRequiredForVisit(true);
      setVisitPlanError(strings.visitLocation.coordsRequired);
      setVisitPlanSuccess(null);
      return;
    }
    setAddressRequiredForVisit(false);
    setPlanningVisit(true);
    setVisitPlanError(null);
    setVisitPlanSuccess(null);
    try {
      const visit = await visitsApi.create({
        contactId: contact.id,
        companyId: contact.companyId ?? undefined,
        title: `${contact.lastName} ${contact.firstName}`.trim() || "Visit",
        phone: contact.phone ?? undefined,
        purpose: visitPurpose.trim() || undefined,
        ...buildVisitLocationCreatePayload(visitLocation, "contact"),
      });
      if (visitStartsAt) {
        const durationMin = Math.max(15, Number.parseInt(visitDurationMin, 10) || 60);
        const startsAt = new Date(visitStartsAt);
        const endsAt = new Date(startsAt.getTime() + durationMin * 60 * 1000);
        await visitsApi.update(visit.id, {
          status: "SCHEDULED",
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          durationMin,
          purpose: visitPurpose.trim() || undefined,
        });
        setVisitPlanSuccess(strings.contacts.card.visit.scheduleDated);
      } else {
        setVisitPlanSuccess(strings.contacts.card.visit.addToBacklog);
      }
      setVisitPurpose("");
      setVisitStartsAt("");
      setVisitDurationMin("60");
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Не вдалося запланувати візит");
      setVisitPlanError(msg);
      setVisitPlanSuccess(null);
    } finally {
      setPlanningVisit(false);
    }
  }, [contact, visitDurationMin, visitLocation, visitPurpose, visitStartsAt]);

  const openMainOrderModal = useCallback(async () => {
    if (isCreate || creatingOrder) return;
    setCreatingOrder(true);
    setErr(null);
    try {
      const payload = {
        clientId: effectiveContactId,
        contactId: effectiveContactId,
        companyId: contact?.companyId ?? null,
      };
      const res = await apiHttp.post<{ id: string; clientId?: string | null }>("/orders", payload);
      const createdId = res.data?.id;
      if (!createdId) throw new Error("У відповіді відсутній id замовлення");

      if (res.data?.clientId !== effectiveContactId) {
        await apiHttp.patch(`/orders/${createdId}`, {
          clientId: effectiveContactId,
          contactId: effectiveContactId,
          ...(contact?.companyId ? { companyId: contact.companyId } : {}),
        });
      }

      openOrder(createdId);
      setOrdersReloadKey((k) => k + 1);
      void cardSummary.refetch();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Не вдалося створити замовлення");
      setErr(msg);
    } finally {
      setCreatingOrder(false);
    }
  }, [contact?.companyId, effectiveContactId, creatingOrder, isCreate, cardSummary, openOrder]);

  const enqueueDialer = useCallback(async () => {
    setQueueingDialer(true);
    setErr(null);
    try {
      await manualCallingApi.enqueue({ contactId: effectiveContactId });
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Не вдалося додати в чергу");
      setErr(msg);
    } finally {
      setQueueingDialer(false);
    }
  }, [effectiveContactId]);

  const resetStorePassword = useCallback(async () => {
    setResetPasswordError(null);
    setResetPasswordResult(null);
    setResetPasswordPublicStoreBase(null);
    setResetPasswordLoading(true);
    try {
      const res = await apiHttp.post<{
        tempPassword: string;
        setPasswordToken: string;
      }>(`/contacts/${effectiveContactId}/reset-store-password`);
      let storeBase = "";
      try {
        const cfg = await apiHttp.get<{ publicStoreUrl?: string }>("/settings/store");
        const u = cfg.data?.publicStoreUrl;
        if (typeof u === "string") storeBase = u.trim().replace(/\/+$/, "");
      } catch {
        /* ignore */
      }
      if (!storeBase && typeof process.env.NEXT_PUBLIC_STORE_PUBLIC_URL === "string") {
        storeBase = process.env.NEXT_PUBLIC_STORE_PUBLIC_URL.replace(/\/+$/, "");
      }
      setResetPasswordPublicStoreBase(storeBase || null);
      setResetPasswordResult(res.data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : null;
      setResetPasswordError(msg ?? "У контакта немає акаунта в магазині або сталася помилка.");
    } finally {
      setResetPasswordLoading(false);
    }
  }, [effectiveContactId]);

  const saveNextAction = useCallback(async () => {
    if (isCreate || !contact) return;
    setSavingNextAction(true);
    setNextActionError(null);
    setNextActionSuccess(null);
    try {
      const normalizedType = nextActionType.trim() || null;
      const payload = {
        nextActionType: normalizedType as
          | "CALL"
          | "MESSAGE"
          | "SEND_OFFER"
          | "CONTROL_PAYMENT"
          | "MEETING"
          | "NO_ACTION"
          | null,
        nextActionAt:
          normalizedType && normalizedType !== "NO_ACTION" && nextActionAt.trim()
            ? new Date(nextActionAt).toISOString()
            : null,
        nextActionNote:
          normalizedType && normalizedType !== "NO_ACTION" ? nextActionNote.trim() || null : null,
      };
      const updated = await contactsApi.updateNextAction(contact.id, payload);
      setContact((prev) => (prev ? { ...prev, ...updated } : (updated as ContactModalContact)));
      setNextActionType((updated.nextActionType ?? "") as string);
      setNextActionAt(toDateTimeLocalValue(updated.nextActionAt));
      setNextActionNote((updated.nextActionNote ?? "") as string);
      setNextActionSuccess(strings.contacts.card.work.actionSaved);
      await contactInsights.refetch();
      onUpdate();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Не вдалося зберегти наступну дію");
      setNextActionError(msg);
    } finally {
      setSavingNextAction(false);
    }
  }, [
    contact,
    contactInsights,
    isCreate,
    nextActionAt,
    nextActionNote,
    nextActionType,
    onUpdate,
  ]);

  const saveClientStage = useCallback(async () => {
    if (isCreate || !contact) return;
    setSavingStage(true);
    setStageError(null);
    setStageSuccess(null);
    try {
      const updated = await contactsApi.updateStage(contact.id, {
        clientStage: (clientStage.trim() || null) as
          | "NEW_LEAD"
          | "IN_PROGRESS"
          | "WAITING_DECISION"
          | "ACTIVE_CLIENT"
          | "DORMANT_CLIENT"
          | "AT_RISK"
          | "PROBLEM_DEBT"
          | "LOST_CLIENT"
          | null,
      });
      setContact((prev) => (prev ? { ...prev, ...updated } : (updated as ContactModalContact)));
      setClientStage((updated.clientStage ?? "") as string);
      setStageSuccess(strings.contacts.card.work.stageSaved);
      onUpdate();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Не вдалося зберегти стадію клієнта");
      setStageError(msg);
    } finally {
      setSavingStage(false);
    }
  }, [clientStage, contact, isCreate, onUpdate]);

  const companyOptions = useMemo(() => {
    const list = companies.map((c) => ({ id: String(c.id), label: c.name }));
    if (selectedCompany && !list.some((o) => o.id === selectedCompany.id)) {
      return [{ id: selectedCompany.id, label: selectedCompany.name }, ...list];
    }
    return list;
  }, [companies, selectedCompany]);

  const companyOptionsWithEmpty = useMemo(
    () => [{ id: "", label: strings.contacts.create.noCompany }, ...companyOptions],
    [companyOptions],
  );

  const userOptions = useMemo(
    () => users.map((u) => ({ id: String(u.id), label: u.fullName || u.email })),
    [users],
  );

  const registerCancel = useCallback((cancel: (() => void) | null) => {
    cancelInlineEditRef.current = cancel;
  }, []);

  const shellHeader = useContactCardShellHeader({
    fullName,
    companyName: contact?.company?.name ?? cardSummary.data?.contact.company?.name,
    companyId: contact?.companyId ?? cardSummary.data?.contact.company?.id,
    phone: contact?.phone,
    status: contact?.status ?? cardSummary.data?.contact.status,
    clientType: contact?.clientType ?? cardSummary.data?.contact.clientType,
    ownerName: contact?.owner?.fullName ?? cardSummary.data?.contact.owner?.name,
    badges: badgesFromSummary(cardSummary.data),
    onOpenCompany,
    creatingOrder,
    queueingDialer,
    resetPasswordLoading,
    canEnqueueDialer:
      effectiveRole === "MANAGER" || effectiveRole === "ADMIN" || effectiveRole === "LEAD",
    canDelete: effectiveRole === "ADMIN",
    onCreateOrder: () => void openMainOrderModal(),
    onCreateTask: () => setLeftTab("activity"),
    onScheduleVisit: () => {
      setLeftTab("overview");
      void scheduleVisit();
    },
    onEnqueueDialer: () => void enqueueDialer(),
    onResetPassword: () => void resetStorePassword(),
    onDelete: () => {
      if (!contact) return;
      if (!confirm(`${strings.contacts.actions.deleteContact} "${fullName}"?`)) return;
      void contactsApi
        .delete(contact.id)
        .then(() => {
          onUpdate();
          onClose();
        })
        .catch((e) => {
          const msg =
            (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            (e instanceof Error ? e.message : "Не вдалося видалити контакт");
          alert(msg);
        });
    },
    telegramConversationId: contact?.telegramConversationId,
    email: contact?.email,
  });

  const cardT = strings.contacts.card;

  const tabsUnderHeader = (
    <div className="flex gap-1 overflow-x-auto py-2 whitespace-nowrap">
      {(
        [
          "overview",
          "activity",
          "orders",
          ...(financeModuleEnabled ? (["finance"] as const) : []),
          "delivery",
          "profile",
        ] as const
      ).map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => setLeftTab(tab)}
          className={`shrink-0 rounded px-2 py-1.5 text-sm font-medium ${
            leftTab === tab ? "bg-accent-gradient text-white" : "text-zinc-600 hover:bg-zinc-100"
          }`}
        >
          {cardT.tabs[tab]}
        </button>
      ))}
    </div>
  );

  const overviewLeft = (
    <div className="space-y-3">
      {justSavedBanner ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {strings.contacts.create.saved}
        </div>
      ) : null}
      {err ? (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">{err}</div>
      ) : null}
      {loading ? (
        <div className="text-sm text-zinc-500">Завантаження…</div>
      ) : contact ? (
        <>
          <EntitySection title={cardT.identity.sectionTitle}>
            <ContactIdentityFields
              contact={contact}
              saving={saving}
              ownerId={ownerId}
              companyId={companyId}
              userOptions={userOptions}
              companyOptionsWithEmpty={companyOptionsWithEmpty}
              loadingUsers={loadingUsers}
              loadingCompanies={loadingCompanies}
              addressRequiredForVisit={addressRequiredForVisit}
              onOpenCompany={onOpenCompany}
              onCompanySearchQueryChange={onCompanySearchQueryChange}
              onCompanySelected={(c) => rememberSelectedCompany(c?.id ?? null, c?.name)}
              onPatch={patchContact}
              onRefresh={() => void refresh()}
              onRegisterCancel={registerCancel}
            />
          </EntitySection>
          <EntitySection title={cardT.profile.customFields}>
            <CustomFieldsPanel entityType="CONTACT" entityId={effectiveContactId} />
          </EntitySection>
        </>
      ) : (
        <div className="text-sm text-zinc-500">Не знайдено</div>
      )}
    </div>
  );

  const overviewRight = (
    <div className="space-y-3">
      {cardSummary.loading ? (
        <ContactCardSkeleton />
      ) : cardSummary.error ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {cardT.summaryLoadError}
        </div>
      ) : cardSummary.data ? (
        <ContactKpiStrip
          kpi={cardSummary.data.kpi}
          scopeNote={cardSummary.data.insights.scopeNote}
        />
      ) : null}
      <ContactWorkPanel
        summary={cardSummary.data}
        insightsLoading={contactInsights.loading}
        insightsError={contactInsights.error}
        insights={contactInsights.data}
        clientStage={clientStage}
        onClientStageChange={(v) => {
          setClientStage(v);
          setStageSuccess(null);
        }}
        savingStage={savingStage}
        stageError={stageError}
        stageSuccess={stageSuccess}
        onSaveStage={() => void saveClientStage()}
        nextActionType={nextActionType}
        nextActionAt={nextActionAt}
        nextActionNote={nextActionNote}
        onNextActionTypeChange={(v) => {
          setNextActionType(v);
          setNextActionSuccess(null);
        }}
        onNextActionAtChange={(v) => {
          setNextActionAt(v);
          setNextActionSuccess(null);
        }}
        onNextActionNoteChange={(v) => {
          setNextActionNote(v);
          setNextActionSuccess(null);
        }}
        savingNextAction={savingNextAction}
        nextActionError={nextActionError}
        nextActionSuccess={nextActionSuccess}
        onSaveNextAction={() => void saveNextAction()}
      />
      {contact ? (
        <ContactVisitPlanner
          addresses={contact.addresses ?? []}
          visitLocation={visitLocation}
          onVisitLocationChange={(next) => {
            setVisitLocation(next);
            setAddressRequiredForVisit(false);
          }}
          mapsApiKey={mapsApiKey}
          addressRequiredForVisit={addressRequiredForVisit}
          visitPurpose={visitPurpose}
          onVisitPurposeChange={setVisitPurpose}
          visitStartsAt={visitStartsAt}
          onVisitStartsAtChange={setVisitStartsAt}
          visitDurationMin={visitDurationMin}
          onVisitDurationMinChange={setVisitDurationMin}
          lastVisitAt={contact.lastVisitAt}
          planningVisit={planningVisit}
          visitPlanError={visitPlanError}
          visitPlanSuccess={visitPlanSuccess}
          saving={saving}
          onScheduleVisit={() => void scheduleVisit()}
        />
      ) : null}
    </div>
  );

  let leftContent: ReactNode;
  let rightContent: ReactNode = null;

  if (isCreate) {
    leftContent = (
      <div className="min-h-0 overflow-auto space-y-3">
        {err ? (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">{err}</div>
        ) : null}
        <ContactCreateForm
          values={createFormValues}
          saving={saving}
          companyOptions={companyOptions}
          userOptions={userOptions}
          loadingCompanies={loadingCompanies}
          loadingUsers={loadingUsers}
          duplicate={phoneDuplicate}
          onChange={handleCreateFieldChange}
          onCompanySearchQueryChange={onCompanySearchQueryChange}
          onCompanySelected={(c) => rememberSelectedCompany(c?.id ?? null, c?.name)}
          onOpenCompany={onOpenCompany}
          onOpenExistingContact={(id) => onCreated?.(id)}
        />
      </div>
    );
  } else if (leftTab === "overview") {
    leftContent = overviewLeft;
    rightContent = overviewRight;
  } else if (leftTab === "activity") {
    leftContent = (
      <ContactActivityTab
        apiBaseUrl={apiBaseUrl}
        contactId={effectiveContactId}
        isCreate={isCreate}
      />
    );
  } else if (leftTab === "orders") {
    leftContent = (
      <EntitySection title={cardT.tabs.orders}>
        <div className="min-h-0 overflow-auto">
          <ContactOrdersPanel
            key={mergedOrdersReloadKey}
            contactId={effectiveContactId}
            reloadKey={mergedOrdersReloadKey}
            onOpenOrder={openOrder}
            onOpenReturn={openReturn}
          />
        </div>
      </EntitySection>
    );
  } else if (leftTab === "finance" && financeModuleEnabled) {
    leftContent = (
      <ContactFinanceTab
        contactId={effectiveContactId}
        isCreate={isCreate}
        financeRestricted={cardSummary.data?.insights.financeRestricted}
        onOpenOrder={openOrder}
        analytics={cardAnalytics.data}
        analyticsLoading={cardAnalytics.loading}
        analyticsError={cardAnalytics.error}
        range={analyticsRange}
        scope={analyticsScope}
        onRangeChange={setAnalyticsRange}
        onScopeChange={setAnalyticsScope}
        canUseCompanyScope={Boolean(contact?.companyId)}
      />
    );
  } else if (leftTab === "delivery") {
    leftContent = (
      <ContactDeliveryProfilesTab
        isCreate={isCreate}
        apiBaseUrl={apiBaseUrl}
        contactId={effectiveContactId}
        contactPerson={
          contact
            ? {
                firstName: contact.firstName ?? "",
                lastName: contact.lastName ?? "",
                phone: contact.phone ?? "",
              }
            : undefined
        }
      />
    );
  } else if (leftTab === "profile") {
    leftContent = (
      <ContactProfileTab
        contact={contact}
        contactId={effectiveContactId}
        isCreate={isCreate}
        saving={saving}
        isAdmin={effectiveRole === "ADMIN"}
        onPatch={patchContact}
        onRegisterCancel={registerCancel}
      />
    );
  } else {
    leftContent = null;
  }

  const footer = isCreate ? (
    <div className="flex flex-wrap justify-end gap-2">
      <button
        type="button"
        onClick={handleCloseCreate}
        disabled={saving}
        className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        {strings.common.cancel}
      </button>
      <button
        type="button"
        onClick={() => void saveCreate({ closeAfter: true })}
        disabled={saving}
        className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        {saving ? strings.contacts.create.saving : strings.contacts.create.saveAndClose}
      </button>
      <button
        type="button"
        onClick={() => void saveCreate({ closeAfter: false })}
        disabled={saving}
        className="btn-primary"
      >
        {saving ? strings.contacts.create.saving : strings.common.save}
      </button>
    </div>
  ) : null;

  return (
    <>
      <EntityModalShell
        title={isCreate ? fullName : shellHeader.title}
        subtitle={isCreate ? undefined : shellHeader.subtitle}
        headerActions={isCreate ? null : shellHeader.headerActions}
        tabsUnderHeader={isCreate ? undefined : tabsUnderHeader}
        size={isCreate ? "compact" : "default"}
        left={leftContent}
        right={rightContent}
        footer={footer}
        canClose={canClose}
        onClose={isCreate ? handleCloseCreate : onClose}
        onEscape={handleEscape}
        zIndex={zIndex}
      />

      {!usesExternalOrders && orderId ? (
        <OrderModal
          apiBaseUrl={apiBaseUrl}
          orderId={orderId}
          zIndex={(zIndex ?? 50) + 10}
          prefill={{
            clientId: effectiveContactId,
            companyId: contact?.companyId ?? null,
          }}
          onClose={() => setOrderId(null)}
          onSaved={() => {
            setOrdersReloadKey((k) => k + 1);
            void cardSummary.refetch();
          }}
          onOpenOrder={openOrder}
          onOpenCompany={onOpenCompany}
        />
      ) : null}

      {!usesExternalReturns && returnId ? (
        <ReturnModal
          returnId={returnId}
          zIndex={(zIndex ?? 50) + 20}
          onClose={() => setReturnId(null)}
          onSaved={() => {
            setOrdersReloadKey((k) => k + 1);
            void cardSummary.refetch();
          }}
          onOpenOrder={(id) => {
            setReturnId(null);
            openOrder(id);
          }}
        />
      ) : null}

      {resetPasswordResult !== null || resetPasswordError !== null ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            scheduleModalClose(closeResetPasswordDialog);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal
          >
            <h3 className="text-sm font-semibold text-zinc-900">
              {strings.contacts.actions.resetPassword}
            </h3>
            {resetPasswordError ? (
              <>
                <p className="mt-2 text-sm text-red-600">{resetPasswordError}</p>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => scheduleModalClose(closeResetPasswordDialog)}
                    className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
                  >
                    {strings.common.cancel}
                  </button>
                </div>
              </>
            ) : resetPasswordResult ? (
              <>
                <p className="mt-2 text-sm text-zinc-600">
                  Тимчасовий пароль і посилання для встановлення свого пароля (діє 24 год):
                </p>
                <div className="mt-3 space-y-2">
                  <div>
                    <span className="text-xs text-zinc-500">Тимчасовий пароль:</span>
                    <div className="mt-0.5 flex items-center gap-2">
                      <code className="flex-1 rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 font-mono text-sm">
                        {resetPasswordResult.tempPassword}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(resetPasswordResult.tempPassword);
                        }}
                        className="shrink-0 rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                      >
                        Копіювати
                      </button>
                    </div>
                  </div>
                  {resetPasswordFullUrl ? (
                    <div>
                      <span className="text-xs text-zinc-500">Посилання для встановлення пароля:</span>
                      <div className="mt-0.5 space-y-2">
                        <code className="block max-h-24 overflow-auto break-all rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 font-mono text-xs">
                          {resetPasswordFullUrl}
                        </code>
                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            href={resetPasswordFullUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                          >
                            Відкрити в новій вкладці
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(resetPasswordFullUrl);
                            }}
                            className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                          >
                            Копіювати посилання
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="rounded border border-amber-200 bg-amber-50 px-2 py-2 text-xs text-amber-900">
                      Щоб отримати готове посилання, вкажіть «Публічна URL вітрини» в{" "}
                      <span className="font-medium">Налаштування → Інтернет-магазин</span> або задайте
                      змінну <span className="font-mono">NEXT_PUBLIC_STORE_PUBLIC_URL</span> при збірці
                      CRM.
                    </p>
                  )}
                  <div>
                    <span className="text-xs text-zinc-500">Токен:</span>
                    <div className="mt-0.5 flex items-center gap-2">
                      <code className="max-h-20 flex-1 overflow-auto break-all rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 font-mono text-xs">
                        {resetPasswordResult.setPasswordToken}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(resetPasswordResult.setPasswordToken);
                        }}
                        className="shrink-0 rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                      >
                        Копіювати
                      </button>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => scheduleModalClose(closeResetPasswordDialog)}
                    className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
                  >
                    {strings.common.cancel}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
