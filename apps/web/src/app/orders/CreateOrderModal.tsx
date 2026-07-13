"use client";

import { useState, useEffect, useCallback } from "react";
import { SearchableSelect } from "../../components/SearchableSelect";
import { apiHttp } from "../../lib/api/client";
import { scheduleModalClose } from "@/lib/modal/scheduleModalClose";
import { listBankAccountsForOrder } from "../../lib/api/resources/bank";
import { listWarehouses, type WarehouseItem } from "../../lib/api/resources/warehouses";
import { ModuleIds } from "@/lib/modules/module-ids";
import { useModules } from "@/lib/modules/useModules";

// --- Enums (должны совпадать с Prisma) ---
enum DeliveryMethod {
  PICKUP = "PICKUP",
  NOVA_POSHTA = "NOVA_POSHTA",
}

enum PaymentMethod {
  FOP = "FOP",
  CASH = "CASH",
}

enum PaymentType {
  PREPAYMENT = "PREPAYMENT",
  DEFERRED = "DEFERRED",
}

type CompanyOption = { id: string; name: string };
type CompaniesResponse = { items?: CompanyOption[] };
type ContactsResponse = { items: ContactOption[] };

type ContactOption = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  companyId?: string | null;
};

type CreateOrderResponse = { id: string };

type CreateOrderModalProps = {
  apiBaseUrl: string;
  onClose: () => void;
  onOrderCreated: (newOrderId: string) => void;
};

export function CreateOrderModal({
  apiBaseUrl: _apiBaseUrl,
  onClose,
  onOrderCreated,
}: CreateOrderModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Form State ---
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  // Новые поля
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>(DeliveryMethod.PICKUP);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [paymentType, setPaymentType] = useState<PaymentType | null>(null);
  const [deliveryData, setDeliveryData] = useState({
    city: "",
    warehouse: "",
  });
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [bankAccountId, setBankAccountId] = useState<string | null>(null);

  // --- Data State ---
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [fopAccounts, setFopAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const { status: modulesStatus, effective: moduleEffective } = useModules();
  const npModuleEffective =
    modulesStatus !== "ready" || moduleEffective(ModuleIds.NovaPoshta);

  // (Загрузка данных useEffect остается без изменений...)
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoadingCompanies(true);
      try {
        const res = await apiHttp.get<CompaniesResponse>("/companies", {
          params: { page: 1, pageSize: 100 },
        });
        if (mounted) setCompanies(res.data.items || []);
      } catch (e: unknown) {
        console.error("Failed to load companies", e);
      } finally {
        if (mounted) setLoadingCompanies(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const fetchContacts = useCallback(async (filterCompanyId: string | null) => {
    setLoadingContacts(true);
    try {
      const res = await apiHttp.get<ContactsResponse>("/contacts", {
        params: { companyId: filterCompanyId || undefined, pageSize: 100 },
      });
      setContacts(res.data?.items || []);
    } catch (e) {
      console.error("Failed to load contacts", e);
    } finally {
      setLoadingContacts(false);
    }
  }, []);

  useEffect(() => {
    void fetchContacts(companyId);
  }, [companyId, fetchContacts]);

  useEffect(() => {
    if (!npModuleEffective && deliveryMethod === DeliveryMethod.NOVA_POSHTA) {
      setDeliveryMethod(DeliveryMethod.PICKUP);
    }
  }, [deliveryMethod, npModuleEffective]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [whRes, fopRes] = await Promise.all([
          listWarehouses(),
          listBankAccountsForOrder(),
        ]);
        if (mounted) {
          setWarehouses(whRes);
          setFopAccounts(fopRes);
          if (whRes.length > 0 && warehouseId === null) {
            const sorted = [...whRes].sort((a, b) => a.sortOrder - b.sortOrder);
            setWarehouseId(sorted[0]!.id);
          }
        }
      } catch (e) {
        console.error("Failed to load warehouses / FOP", e);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const handleCreate = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const mockOwnerId = "user-1";
      const res = await apiHttp.post("/orders", {
        ownerId: mockOwnerId,
        companyId,
        clientId,
        comment: comment || undefined,
        deliveryMethod,
        paymentMethod,
        paymentType: paymentType ?? undefined,
        bankAccountId: paymentMethod === PaymentMethod.FOP ? bankAccountId : null,
        warehouseId: warehouseId ?? undefined,
        deliveryData: deliveryMethod === DeliveryMethod.NOVA_POSHTA ? deliveryData : null,
        discountAmount: 0,
      });
      const newOrder = res.data as CreateOrderResponse;
      onOrderCreated(newOrder.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося створити");
      setSubmitting(false);
    }
  };

  const requestClose = () => {
    if (!submitting) scheduleModalClose(onClose);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        requestClose();
      }}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-zinc-900">Нове замовлення</h2>
          <button
            onClick={requestClose}
            disabled={submitting}
            className="rounded-md border border-zinc-200 px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Section: Customer */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Компанія</label>
              <SearchableSelect
                options={companies.map((c) => ({ id: c.id, label: c.name }))}
                value={companyId}
                onChange={(val) => {
                  setCompanyId(val);
                  setClientId(null);
                }}
                isLoading={loadingCompanies}
                placeholder="Оберіть компанію..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Клієнт</label>
              <SearchableSelect
                options={contacts.map((c) => ({ id: c.id, label: `${c.lastName} ${c.firstName}` }))}
                value={clientId}
                onChange={(val) => setClientId(val)}
                isLoading={loadingContacts}
                placeholder="Оберіть клієнта..."
              />
            </div>
          </div>

          {/* Section: Delivery & Payment */}
          <div className="grid grid-cols-2 gap-4 border-t pt-4 border-zinc-100">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Тип оплати</label>
              <select
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none"
                value={paymentType ?? ""}
                onChange={(e) =>
                  setPaymentType((e.target.value || null) as PaymentType | null)
                }
              >
                <option value="">Оберіть...</option>
                <option value={PaymentType.PREPAYMENT}>Передоплата</option>
                <option value={PaymentType.DEFERRED}>Відтермінування</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Спосіб доставки</label>
              <select
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none"
                value={deliveryMethod}
                onChange={(e) => setDeliveryMethod(e.target.value as DeliveryMethod)}
              >
                <option value={DeliveryMethod.PICKUP}>Самовивіз</option>
                {npModuleEffective ? (
                  <option value={DeliveryMethod.NOVA_POSHTA}>Нова Пошта</option>
                ) : null}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Метод оплати</label>
              <select
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none"
                value={paymentMethod}
                onChange={(e) => {
                  setPaymentMethod(e.target.value as PaymentMethod);
                  if (e.target.value !== PaymentMethod.FOP) setBankAccountId(null);
                }}
              >
                <option value={PaymentMethod.CASH}>Готівка</option>
                <option value={PaymentMethod.FOP}>Безготівка</option>
              </select>
            </div>
            {paymentMethod === PaymentMethod.FOP && (
              <div className="col-span-2">
                <label className="block text-xs font-medium text-zinc-600 mb-1">ФОП (банк)</label>
                <select
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none"
                  value={bankAccountId ?? ""}
                  onChange={(e) => setBankAccountId(e.target.value || null)}
                >
                  <option value="">Оберіть рахунок...</option>
                  {fopAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Склад відвантаження</label>
              <select
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none"
                value={warehouseId ?? ""}
                onChange={(e) => setWarehouseId(e.target.value || null)}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Nova Poshta Fields */}
          {npModuleEffective && deliveryMethod === DeliveryMethod.NOVA_POSHTA && (
            <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Місто</label>
                <input
                  type="text"
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  placeholder="Київ"
                  value={deliveryData.city}
                  onChange={(e) => setDeliveryData({ ...deliveryData, city: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Відділення</label>
                <input
                  type="text"
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  placeholder="Відділення №1"
                  value={deliveryData.warehouse}
                  onChange={(e) => setDeliveryData({ ...deliveryData, warehouse: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* Comment */}
          <div className="border-t pt-4 border-zinc-100">
            <label className="block text-xs font-medium text-zinc-600 mb-1">Коментар</label>
            <textarea
              rows={2}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
              placeholder="Додаткові нотатки..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              disabled={submitting}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Скасувати
            </button>
            <button
              onClick={handleCreate}
              disabled={submitting}
              className="btn-primary"
            >
              {submitting ? "Створення..." : "Створити замовлення"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
