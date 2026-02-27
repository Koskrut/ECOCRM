"use client";

import { useState, useEffect, useCallback } from "react";
import { SearchableSelect } from "../../components/SearchableSelect";

// --- Enums (должны совпадать с Prisma) ---
enum DeliveryMethod {
  PICKUP = "PICKUP",
  NOVA_POSHTA = "NOVA_POSHTA",
}

enum PaymentMethod {
  FOP = "FOP",
  CASH = "CASH",
}

type CompanyOption = { id: string; name: string };
type ContactOption = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  companyId?: string | null;
};

type CreateOrderModalProps = {
  apiBaseUrl: string;
  onClose: () => void;
  onOrderCreated: (newOrderId: string) => void;
};

export function CreateOrderModal({ apiBaseUrl, onClose, onOrderCreated }: CreateOrderModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Form State ---
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  // Новые поля
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>(DeliveryMethod.PICKUP);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [deliveryData, setDeliveryData] = useState({
    city: "",
    warehouse: "",
  });

  // --- Data State ---
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);

  // (Загрузка данных useEffect остается без изменений...)
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoadingCompanies(true);
      try {
        const response = await fetch(`${apiBaseUrl}/companies?page=1&pageSize=100`);
        if (response.ok) {
          const data = await response.json();
          if (mounted) setCompanies(data.items || []);
        }
      } catch (e) {
        console.error("Failed to load companies", e);
      } finally {
        if (mounted) setLoadingCompanies(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [apiBaseUrl]);

  const fetchContacts = useCallback(
    async (filterCompanyId: string | null) => {
      setLoadingContacts(true);
      const url = filterCompanyId
        ? `${apiBaseUrl}/contacts?companyId=${filterCompanyId}&pageSize=100`
        : `${apiBaseUrl}/contacts?pageSize=100`;
      try {
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          setContacts(data.items || []);
        }
      } catch (e) {
        console.error("Failed to load contacts", e);
      } finally {
        setLoadingContacts(false);
      }
    },
    [apiBaseUrl],
  );

  useEffect(() => {
    void fetchContacts(companyId);
  }, [companyId, fetchContacts]);

  const handleCreate = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const mockOwnerId = "user-1";

      const response = await fetch(`${apiBaseUrl}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: mockOwnerId,
          companyId,
          clientId,
          comment: comment || undefined,
          deliveryMethod, //
          paymentMethod, //
          deliveryData: deliveryMethod === DeliveryMethod.NOVA_POSHTA ? deliveryData : null,
          discountAmount: 0,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || "Failed to create order");
      }

      const newOrder = await response.json();
      onOrderCreated(newOrder.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-white shadow-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-zinc-900">New Order</h2>
          <button
            onClick={onClose}
            disabled={submitting}
            className="text-zinc-500 hover:text-zinc-800 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Section: Customer */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Company</label>
              <SearchableSelect
                options={companies.map((c) => ({ id: c.id, label: c.name }))}
                value={companyId}
                onChange={(val) => {
                  setCompanyId(val);
                  setClientId(null);
                }}
                isLoading={loadingCompanies}
                placeholder="Select company..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Client</label>
              <SearchableSelect
                options={contacts.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}` }))}
                value={clientId}
                onChange={(val) => setClientId(val)}
                isLoading={loadingContacts}
                placeholder="Select client..."
              />
            </div>
          </div>

          {/* Section: Delivery & Payment */}
          <div className="grid grid-cols-2 gap-4 border-t pt-4 border-zinc-100">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">
                Delivery Method
              </label>
              <select
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none"
                value={deliveryMethod}
                onChange={(e) => setDeliveryMethod(e.target.value as DeliveryMethod)}
              >
                <option value={DeliveryMethod.PICKUP}>Pickup</option>
                <option value={DeliveryMethod.NOVA_POSHTA}>Nova Poshta</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Payment Method</label>
              <select
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              >
                <option value={PaymentMethod.CASH}>Cash</option>
                <option value={PaymentMethod.FOP}>FOP (Bank)</option>
              </select>
            </div>
          </div>

          {/* Nova Poshta Fields */}
          {deliveryMethod === DeliveryMethod.NOVA_POSHTA && (
            <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">City</label>
                <input
                  type="text"
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  placeholder="Kyiv"
                  value={deliveryData.city}
                  onChange={(e) => setDeliveryData({ ...deliveryData, city: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Warehouse</label>
                <input
                  type="text"
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  placeholder="Branch #1"
                  value={deliveryData.warehouse}
                  onChange={(e) => setDeliveryData({ ...deliveryData, warehouse: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* Comment */}
          <div className="border-t pt-4 border-zinc-100">
            <label className="block text-xs font-medium text-zinc-600 mb-1">Comment</label>
            <textarea
              rows={2}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
              placeholder="Optional notes..."
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
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={submitting}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create Order"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
