// apps/web/src/app/orders/TtnModal.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

  onCreated?: (result: any) => void;
};

async function readJsonSafe(r: Response) {
  const text = await r.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export function TtnModal({
  apiBaseUrl,
  open,
  onClose,
  orderId,
  contactId,
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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  const [deliveryType, setDeliveryType] = useState<NpDeliveryType>("WAREHOUSE");
  const [cityRef, setCityRef] = useState("");
  const [cityName, setCityName] = useState("");
  const [warehouseRef, setWarehouseRef] = useState("");

  // ADDRESS (пока disabled в UI, но тип/валидация оставлены корректно)
  const [streetRef, setStreetRef] = useState("");
  const [streetName, setStreetName] = useState("");
  const [building, setBuilding] = useState("");
  const [flat, setFlat] = useState("");

  const canClose = !loading && !creating;

  const resetNewForm = useCallback(() => {
    setSaveToContact(true);
    setLabel("");

    setRecipientType("PERSON");
    setFirstName("");
    setLastName("");
    setPhone("");

    setDeliveryType("WAREHOUSE");
    setCityRef("");
    setCityName("");
    setWarehouseRef("");

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

      const r = await fetch(`${apiBaseUrl}/contacts/${contactId}/shipping-profiles`, {
        cache: "no-store",
        credentials: "include",
      });

      if (r.status === 404) {
        setProfiles([]);
        setMode("NEW");
        setSelectedProfileId("");
        return;
      }

      const dataJson = (await readJsonSafe(r)) as any;

      if (!r.ok) {
        const msg = dataJson?.message || dataJson?.error || `Failed to load profiles (${r.status})`;
        throw new Error(msg);
      }

      const data = dataJson as ProfilesResponse;
      const items = Array.isArray(data) ? data : data?.items || [];

      const sorted = [...items].sort(
        (a, b) => Number(!!b.isDefault) - Number(!!a.isDefault),
      );

      setProfiles(sorted);

      if (sorted.length > 0) {
        setMode("EXISTING");
        setSelectedProfileId(sorted[0].id);
      } else {
        setMode("NEW");
        setSelectedProfileId("");
      }
    } catch (e) {
      setProfiles([]);
      setMode("NEW");
      setSelectedProfileId("");
      setError(e instanceof Error ? e.message : "Failed to load profiles");
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, contactId]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    resetNewForm();
    void loadProfiles();
  }, [open, loadProfiles, resetNewForm]);

  // ESC
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (canClose) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, canClose, onClose]);

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );

  const validateNew = () => {
    if (!firstName.trim()) return "First name is required";
    if (!lastName.trim()) return "Last name is required";
    if (!phone.trim()) return "Phone is required";
    if (!cityRef.trim()) return "CityRef is required";

    if (deliveryType === "ADDRESS") {
      if (!streetRef.trim()) return "StreetRef is required for ADDRESS";
      if (!building.trim()) return "Building is required for ADDRESS";
      return null;
    }

    if (!warehouseRef.trim()) return "WarehouseRef is required for WAREHOUSE/POSTOMAT";
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

    // Next.js proxy endpoint:
    // POST /api/orders/:id/np/ttn
    const createUrl = `${apiBaseUrl}/orders/${orderId}/np/ttn`;

    // ===== EXISTING =====
    if (mode === "EXISTING") {
      if (!selectedProfileId) {
        setError("Select a profile");
        return;
      }

      setCreating(true);
      try {
        const r = await fetch(createUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId: selectedProfileId }),
          cache: "no-store",
          credentials: "include",
        });

        const data = await readJsonSafe(r);

        if (!r.ok) {
          throw new Error((data as any)?.message || `Failed to create TTN (${r.status})`);
        }

        onCreated?.(data);
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create TTN");
      } finally {
        setCreating(false);
      }
      return;
    }

    // ===== NEW =====
    const err = validateNew();
    if (err) {
      setError(err);
      return;
    }

    setCreating(true);
    try {
      const payload: any = {
        saveAsProfile: !!saveToContact,
        profileLabel: label?.trim() || undefined,
        draft: {
          recipientType,
          deliveryType,

          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),

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
              }),
        },
      };

      const r = await fetch(createUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
        credentials: "include",
      });

      const data = await readJsonSafe(r);

      if (!r.ok) {
        throw new Error((data as any)?.message || `Failed to create TTN (${r.status})`);
      }

      onCreated?.(data);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create TTN");
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
    if (!selectedProfile) return "—";

    if (selectedProfile.deliveryType === "ADDRESS") {
      const parts = [
        selectedProfile.streetName || selectedProfile.streetRef || "",
        selectedProfile.building || "",
        selectedProfile.flat ? `кв ${selectedProfile.flat}` : "",
      ]
        .filter(Boolean)
        .join(", ");
      return parts || "—";
    }

    const wh = [
      selectedProfile.warehouseType ? `${selectedProfile.warehouseType}` : "",
      selectedProfile.warehouseNumber ? `№${selectedProfile.warehouseNumber}` : "",
      selectedProfile.warehouseRef ? `(${selectedProfile.warehouseRef.slice(0, 8)}…)` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return wh || "—";
  })();

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
      onClick={() => {
        if (canClose) onClose();
      }}
      role="presentation"
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-lg bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <div>
            <div className="text-sm text-zinc-500">Nova Poshta</div>
            <div className="text-lg font-semibold text-zinc-900">Create TTN</div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (canClose) onClose();
            }}
            className="rounded-md px-3 py-1 text-sm text-zinc-600 hover:bg-zinc-100 disabled:text-zinc-400"
            disabled={!canClose}
          >
            Close
          </button>
        </div>

        <div className="px-6 py-4 max-h-[calc(90vh-64px)] overflow-auto">
          {error ? <div className="mb-3 text-sm text-red-600">{error}</div> : null}

          <div className="mb-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode("EXISTING")}
              className={`rounded-md border px-3 py-1 text-sm ${
                mode === "EXISTING"
                  ? "border-zinc-900 text-zinc-900"
                  : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              }`}
              disabled={loading}
            >
              Existing profile
            </button>

            <button
              type="button"
              onClick={() => setMode("NEW")}
              className={`rounded-md border px-3 py-1 text-sm ${
                mode === "NEW"
                  ? "border-zinc-900 text-zinc-900"
                  : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              }`}
              disabled={loading}
            >
              New profile
            </button>

            <div className="ml-auto text-xs text-zinc-500">
              {loading ? "Loading…" : `${profiles.length} saved`}
            </div>
          </div>

          {mode === "EXISTING" ? (
            <div className="rounded-md border border-zinc-200 bg-white p-4">
              {profiles.length === 0 ? (
                <div className="text-sm text-zinc-600">
                  No saved profiles for this contact. Switch to <b>New profile</b>.
                </div>
              ) : (
                <>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">
                    Choose profile
                  </label>

                  <select
                    value={selectedProfileId}
                    onChange={(e) => setSelectedProfileId(e.target.value)}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
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
                    <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
                      <div className="text-xs text-zinc-500">Preview</div>
                      <div className="mt-1 font-medium text-zinc-900">{profileLabelText}</div>
                      <div className="mt-1 text-zinc-700">
                        {selectedProfile.deliveryType} •{" "}
                        {selectedProfile.cityName ?? selectedProfile.cityRef ?? "—"}
                      </div>
                      <div className="mt-1 text-zinc-700">{previewAddress}</div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-zinc-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-zinc-900">New shipping profile</div>
                <label className="flex items-center gap-2 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={saveToContact}
                    onChange={(e) => setSaveToContact(e.target.checked)}
                  />
                  Save to contact
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-zinc-600">Label (optional)</label>
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                    placeholder='e.g. "Dnipro office", "Ivan home", ...'
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-600">Recipient type</label>
                  <select
                    value={recipientType}
                    onChange={(e) => setRecipientType(e.target.value as NpRecipientType)}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  >
                    <option value="PERSON">PERSON</option>
                    <option value="COMPANY">COMPANY</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-600">Delivery type</label>
                  <select
                    value={deliveryType}
                    onChange={(e) => {
                      const v = e.target.value as NpDeliveryType;
                      if (v === "ADDRESS") {
                        setError("ADDRESS will be enabled later (needs streetRef + building from NP directory).");
                        return;
                      }
                      setError(null);
                      setDeliveryType(v);
                    }}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  >
                    <option value="WAREHOUSE">WAREHOUSE</option>
                    <option value="POSTOMAT">POSTOMAT</option>
                    <option value="ADDRESS" disabled>
                      ADDRESS (soon)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-600">First name</label>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-600">Last name</label>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-medium text-zinc-600">Phone</label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                    placeholder="+380..."
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-medium text-zinc-600">CityRef (NP directory)</label>
                  <input
                    value={cityRef}
                    onChange={(e) => setCityRef(e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                    placeholder="UUID from NP (CityRef)"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-medium text-zinc-600">City name (optional)</label>
                  <input
                    value={cityName}
                    onChange={(e) => setCityName(e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-medium text-zinc-600">WarehouseRef / PostomatRef</label>
                  <input
                    value={warehouseRef}
                    onChange={(e) => setWarehouseRef(e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                    placeholder="UUID from NP (WarehouseRef)"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={!canClose}
              className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-white disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || loading || (mode === "EXISTING" && profiles.length === 0)}
              className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create TTN"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
