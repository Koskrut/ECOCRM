"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkout,
  getMe,
  getMyShippingProfiles,
  getNpCities,
  getNpStreets,
  getNpWarehouses,
  npCityDisplayLabel,
  type CheckoutDeliveryData,
  type NpCityItem,
  type ShippingProfile,
} from "@/lib/api";
import { getCartSessionId } from "@/lib/cart-session";
import { Button } from "@/components/Button";

const inputClass =
  "mt-1 w-full min-h-[48px] rounded-lg border border-[var(--border)] bg-white px-3 py-3 text-zinc-900 outline-none transition focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] sm:min-h-[44px] sm:py-2.5";

export default function CheckoutPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [comment, setComment] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<"PICKUP" | "NOVA_POSHTA">("PICKUP");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [loggedIn, setLoggedIn] = useState(false);
  const [shippingProfiles, setShippingProfiles] = useState<ShippingProfile[]>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [npAddressMode, setNpAddressMode] = useState<"profile" | "new">("new");
  const [npProfileId, setNpProfileId] = useState("");
  const [npCityQuery, setNpCityQuery] = useState("");
  const [npCityOptions, setNpCityOptions] = useState<NpCityItem[]>([]);
  const [npCitySelected, setNpCitySelected] = useState<NpCityItem | null>(null);
  const [npWarehouseQuery, setNpWarehouseQuery] = useState("");
  const [npWarehouseOptions, setNpWarehouseOptions] = useState<Array<{ ref: string; description: string }>>([]);
  const [npWarehouseSelected, setNpWarehouseSelected] = useState<{ ref: string; description: string } | null>(null);
  const [npRecipientType, setNpRecipientType] = useState<"PERSON" | "COMPANY">("PERSON");
  const [npDeliveryType, setNpDeliveryType] = useState<"WAREHOUSE" | "POSTOMAT" | "ADDRESS">("WAREHOUSE");
  const [npRecipientLastName, setNpRecipientLastName] = useState("");
  const [npRecipientFirstName, setNpRecipientFirstName] = useState("");
  const [npRecipientMiddleName, setNpRecipientMiddleName] = useState("");
  const [npRecipientPhone, setNpRecipientPhone] = useState("");
  const [npStreetQuery, setNpStreetQuery] = useState("");
  const [npStreetOptions, setNpStreetOptions] = useState<Array<{ ref: string; street: string }>>([]);
  const [npStreetsSyncing, setNpStreetsSyncing] = useState(false);
  const [npStreetEmptyMessage, setNpStreetEmptyMessage] = useState<string | null>(null);
  const [npStreetSelected, setNpStreetSelected] = useState<{ ref: string; street: string } | null>(null);
  const [npBuilding, setNpBuilding] = useState("");
  const [npFlat, setNpFlat] = useState("");
  const [npCompanyName, setNpCompanyName] = useState("");
  const [npEdrpou, setNpEdrpou] = useState("");
  const [npContactPersonFirstName, setNpContactPersonFirstName] = useState("");
  const [npContactPersonLastName, setNpContactPersonLastName] = useState("");
  const [npContactPersonPhone, setNpContactPersonPhone] = useState("");
  const [npSaveAsProfile, setNpSaveAsProfile] = useState(false);
  const [npProfileLabel, setNpProfileLabel] = useState("");
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getMe()
      .then((me) => {
        setLoggedIn(true);
        setFirstName(me.firstName ?? "");
        setLastName(me.lastName ?? "");
        setEmail(me.email ?? "");
        setPhone(me.phone ?? "");
      })
      .catch(() => setLoggedIn(false));
  }, []);

  useEffect(() => {
    if (!loggedIn) {
      setProfilesLoaded(true);
      setShippingProfiles([]);
      return;
    }
    setProfilesLoaded(false);
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9e2801" },
      body: JSON.stringify({
        sessionId: "9e2801",
        location: "checkout/page.tsx:profiles_fetch",
        message: "getMyShippingProfiles called",
        data: { loggedIn: true },
        timestamp: Date.now(),
        hypothesisId: "H1",
      }),
    }).catch(() => {});
    // #endregion
    getMyShippingProfiles()
      .then((r) => {
        const items = r.items ?? [];
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9e2801" },
          body: JSON.stringify({
            sessionId: "9e2801",
            location: "checkout/page.tsx:profiles_ok",
            message: "getMyShippingProfiles response",
            data: { itemCount: items.length, hasItems: !!r.items },
            timestamp: Date.now(),
            hypothesisId: "H2",
          }),
        }).catch(() => {});
        // #endregion
        setShippingProfiles(items);
        if (items.length === 0) {
          setNpAddressMode("new");
          setNpProfileId("");
        } else if (deliveryMethod === "NOVA_POSHTA") {
          setNpAddressMode("profile");
          setNpProfileId(items[0].id);
        }
      })
      .catch((err) => {
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9e2801" },
          body: JSON.stringify({
            sessionId: "9e2801",
            location: "checkout/page.tsx:profiles_err",
            message: "getMyShippingProfiles failed",
            data: { errMessage: String(err?.message ?? err) },
            timestamp: Date.now(),
            hypothesisId: "H3",
          }),
        }).catch(() => {});
        // #endregion
        setShippingProfiles([]);
      })
      .finally(() => setProfilesLoaded(true));
  }, [loggedIn]);

  useEffect(() => {
    if (deliveryMethod !== "NOVA_POSHTA" || shippingProfiles.length === 0 || npAddressMode === "new") return;
    if (!npProfileId || !shippingProfiles.some((p) => p.id === npProfileId)) {
      setNpAddressMode("profile");
      setNpProfileId(shippingProfiles[0].id);
    }
  }, [deliveryMethod, shippingProfiles, npProfileId, npAddressMode]);

  useEffect(() => {
    if (!profileDropdownOpen) return;
    const close = (e: MouseEvent) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(e.target as Node)) {
        setProfileDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [profileDropdownOpen]);

  const fetchCities = useCallback(() => {
    const q = npCityQuery.trim();
    if (q.length < 2) {
      setNpCityOptions([]);
      return;
    }
    getNpCities(q, 20)
      .then((r) => setNpCityOptions(r.items ?? []))
      .catch(() => setNpCityOptions([]));
  }, [npCityQuery]);

  useEffect(() => {
    const t = setTimeout(fetchCities, 300);
    return () => clearTimeout(t);
  }, [fetchCities]);

  const fetchWarehouses = useCallback(() => {
    if (!npCitySelected?.ref || (npDeliveryType !== "WAREHOUSE" && npDeliveryType !== "POSTOMAT")) {
      setNpWarehouseOptions([]);
      return;
    }
    const q = npWarehouseQuery.trim() || " ";
    getNpWarehouses(npCitySelected.ref, q, npDeliveryType, 30)
      .then((r) => setNpWarehouseOptions(r.items ?? []))
      .catch(() => setNpWarehouseOptions([]));
  }, [npCitySelected?.ref, npWarehouseQuery, npDeliveryType]);

  useEffect(() => {
    const t = setTimeout(fetchWarehouses, 300);
    return () => clearTimeout(t);
  }, [fetchWarehouses]);

  const fetchStreets = useCallback(() => {
    if (!npCitySelected?.ref || npDeliveryType !== "ADDRESS") {
      setNpStreetOptions([]);
      setNpStreetsSyncing(false);
      return;
    }
    const q = npStreetQuery.trim();
    if (q.length < 3) {
      setNpStreetOptions([]);
      setNpStreetsSyncing(false);
      return;
    }
    getNpStreets(npCitySelected.ref, q, 20)
      .then((r) => {
        const items = r.items ?? [];
        setNpStreetOptions(items);
        setNpStreetEmptyMessage(items.length === 0 && r.message ? r.message : null);
        if (r.status === "SYNCING") {
          setNpStreetsSyncing(true);
          setTimeout(() => fetchStreets(), 2500);
        } else {
          setNpStreetsSyncing(false);
        }
      })
      .catch(() => {
        setNpStreetOptions([]);
        setNpStreetsSyncing(false);
      });
  }, [npCitySelected?.ref, npStreetQuery, npDeliveryType]);

  useEffect(() => {
    const t = setTimeout(fetchStreets, 300);
    return () => clearTimeout(t);
  }, [fetchStreets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const sessionId = getCartSessionId();
      let deliveryData: CheckoutDeliveryData | null | undefined;
      if (deliveryMethod === "NOVA_POSHTA") {
        const effectiveProfileId =
          npAddressMode === "profile" ? (npProfileId || shippingProfiles[0]?.id) ?? "" : "";
        if (effectiveProfileId) {
          deliveryData = { profileId: effectiveProfileId };
        } else {
          if (!npCitySelected?.ref) {
            setError("Оберіть місто");
            setSubmitting(false);
            return;
          }
          if (npDeliveryType === "WAREHOUSE" || npDeliveryType === "POSTOMAT") {
            if (!npWarehouseSelected?.ref) {
              setError("Оберіть відділення або поштомат");
              setSubmitting(false);
              return;
            }
          } else {
            if (!npStreetSelected?.ref || !npBuilding.trim()) {
              setError("Вкажіть вулицю та номер будинку");
              setSubmitting(false);
              return;
            }
          }
          if (npRecipientType === "PERSON") {
            if (!npRecipientLastName.trim() || !npRecipientFirstName.trim() || !npRecipientPhone.trim()) {
              setError("Вкажіть прізвище, ім'я та телефон отримувача");
              setSubmitting(false);
              return;
            }
          } else {
            if (
              !npCompanyName.trim() ||
              !npEdrpou.trim() ||
              !npContactPersonFirstName.trim() ||
              !npContactPersonLastName.trim() ||
              !npContactPersonPhone.trim()
            ) {
              setError("Заповніть дані компанії та контактної особи");
              setSubmitting(false);
              return;
            }
          }
          const base = {
            recipientType: npRecipientType,
            deliveryType: npDeliveryType,
            cityRef: npCitySelected.ref,
            cityName: npCitySelected.description,
            saveAsProfile: loggedIn ? npSaveAsProfile : undefined,
            profileLabel: npProfileLabel.trim() || undefined,
          };
          if (npDeliveryType === "WAREHOUSE" || npDeliveryType === "POSTOMAT") {
            deliveryData = {
              ...base,
              warehouseRef: npWarehouseSelected!.ref,
              warehouseName: npWarehouseSelected!.description,
            };
          } else {
            deliveryData = {
              ...base,
              streetRef: npStreetSelected!.ref,
              streetName: npStreetSelected!.street,
              building: npBuilding.trim(),
              flat: npFlat.trim() || undefined,
            };
          }
          if (npRecipientType === "PERSON") {
            (deliveryData as Record<string, unknown>).firstName = npRecipientFirstName.trim();
            (deliveryData as Record<string, unknown>).lastName = npRecipientLastName.trim();
            if (npRecipientMiddleName.trim()) {
              (deliveryData as Record<string, unknown>).middleName = npRecipientMiddleName.trim();
            }
            const fullName = [npRecipientLastName.trim(), npRecipientFirstName.trim(), npRecipientMiddleName.trim()].filter(Boolean).join(" ");
            (deliveryData as Record<string, unknown>).recipientName = fullName;
            (deliveryData as Record<string, unknown>).recipientPhone = npRecipientPhone.trim();
            (deliveryData as Record<string, unknown>).phone = npRecipientPhone.trim();
          } else {
            (deliveryData as Record<string, unknown>).companyName = npCompanyName.trim();
            (deliveryData as Record<string, unknown>).edrpou = npEdrpou.trim();
            (deliveryData as Record<string, unknown>).contactPersonFirstName = npContactPersonFirstName.trim();
            (deliveryData as Record<string, unknown>).contactPersonLastName = npContactPersonLastName.trim();
            (deliveryData as Record<string, unknown>).contactPersonPhone = npContactPersonPhone.trim();
          }
        }
      }
      const result = await checkout({
        phone: phone.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        email: email.trim() || undefined,
        comment: comment.trim() || undefined,
        deliveryMethod,
        deliveryData: deliveryData ?? null,
        sessionId,
      });
      router.push(
        "/thank-you?orderNumber=" +
          encodeURIComponent(result.orderNumber) +
          (result.setPasswordToken
            ? "&setPasswordToken=" + encodeURIComponent(result.setPasswordToken)
            : ""),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка оформлення");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-md px-4 py-6 sm:px-6 sm:py-8">
        <Link
          href="/cart"
          className="mb-6 inline-flex min-h-[44px] items-center text-sm text-zinc-600 hover:text-[var(--primary)] transition -ml-1"
        >
          ← Кошик
        </Link>
        <h1 className="font-heading text-xl font-semibold text-zinc-900 sm:text-2xl">
          Оформлення замовлення
        </h1>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
          )}
          <div>
            <label className="block text-sm font-medium text-zinc-700">Телефон *</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700">Ім'я *</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700">Прізвище</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700">Спосіб доставки *</label>
            <div className="mt-2 space-y-2">
              <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-lg border border-[var(--border)] bg-white px-3 py-3 transition has-[:checked]:border-[var(--primary)] has-[:checked]:ring-1 has-[:checked]:ring-[var(--primary)]">
                <input
                  type="radio"
                  name="deliveryMethod"
                  value="PICKUP"
                  checked={deliveryMethod === "PICKUP"}
                  onChange={() => setDeliveryMethod("PICKUP")}
                  className="h-4 w-4 border-zinc-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                />
                <span className="text-zinc-900">Самовивіз</span>
              </label>
              <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-lg border border-[var(--border)] bg-white px-3 py-3 transition has-[:checked]:border-[var(--primary)] has-[:checked]:ring-1 has-[:checked]:ring-[var(--primary)]">
                <input
                  type="radio"
                  name="deliveryMethod"
                  value="NOVA_POSHTA"
                  checked={deliveryMethod === "NOVA_POSHTA"}
                  onChange={() => setDeliveryMethod("NOVA_POSHTA")}
                  className="h-4 w-4 border-zinc-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                />
                <span className="text-zinc-900">Нова пошта</span>
              </label>
            </div>
          </div>

          {deliveryMethod === "NOVA_POSHTA" && (
            <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <h3 className="text-sm font-medium text-zinc-800">Адреса доставки Нова пошта</h3>
              {profilesLoaded && shippingProfiles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-zinc-700">Оберіть адресу</p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                    <label className="flex cursor-pointer items-center gap-2" htmlFor="np-mode-profile">
                      <input
                        id="np-mode-profile"
                        type="radio"
                        name="npMode"
                        checked={npAddressMode === "profile"}
                        onChange={() => {
                          setNpAddressMode("profile");
                          setNpProfileId(shippingProfiles[0]?.id ?? "");
                        }}
                        className="h-4 w-4 flex-shrink-0"
                      />
                      <span className="text-sm">Збережена адреса</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2" htmlFor="np-mode-new">
                      <input
                        id="np-mode-new"
                        type="radio"
                        name="npMode"
                        checked={npAddressMode === "new"}
                        onChange={() => {
                          setNpAddressMode("new");
                          setNpProfileId("");
                        }}
                        className="h-4 w-4 flex-shrink-0"
                      />
                      <span className="text-sm">Новий профіль</span>
                    </label>
                  </div>
                  {npAddressMode === "profile" && (
                    <div className="relative" ref={profileDropdownRef}>
                      <button
                        type="button"
                        onClick={() => setProfileDropdownOpen((v) => !v)}
                        className={
                          "group flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-left shadow-sm outline-none transition hover:border-zinc-300 focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 " +
                          (profileDropdownOpen ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/20" : "")
                        }
                        aria-expanded={profileDropdownOpen}
                        aria-haspopup="listbox"
                        aria-label="Оберіть збережену адресу доставки"
                      >
                        {(() => {
                          const selected = shippingProfiles.find(
                            (p) => p.id === (npProfileId || shippingProfiles[0]?.id),
                          );
                          if (!selected) {
                            return (
                              <span className="flex flex-1 items-center gap-2 text-zinc-500">
                                <span className="text-lg">📍</span>
                                Оберіть адресу доставки
                              </span>
                            );
                          }
                          const recipient = [selected.lastName, selected.firstName]
                            .filter(Boolean)
                            .join(" ") || "—";
                          return (
                            <span className="min-w-0 flex-1">
                              {(selected.cityName || selected.warehouseNumber || selected.warehouseType) && (
                                <div className="font-medium text-zinc-800">
                                  {[selected.cityName, selected.warehouseNumber || selected.warehouseType]
                                    .filter(Boolean)
                                    .join(", ")}
                                </div>
                              )}
                              <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm text-zinc-500">
                                <span>{recipient}</span>
                                {selected.phone && (
                                  <>
                                    <span className="text-zinc-300">·</span>
                                    <span>{selected.phone}</span>
                                  </>
                                )}
                              </div>
                            </span>
                          );
                        })()}
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-zinc-500 transition group-hover:bg-zinc-200"
                          aria-hidden
                        >
                          {profileDropdownOpen ? "▲" : "▼"}
                        </span>
                      </button>
                      {profileDropdownOpen && (
                        <ul
                          className="absolute top-full left-0 z-20 mt-2 max-h-[min(20rem,70vh)] w-full overflow-auto rounded-xl border border-[var(--border)] bg-white py-2 shadow-lg"
                          role="listbox"
                          aria-label="Збережені адреси доставки"
                        >
                          {shippingProfiles.map((p) => {
                            const selected = p.id === (npProfileId || shippingProfiles[0]?.id);
                            const recipient = [p.lastName, p.firstName].filter(Boolean).join(" ") || "—";
                            return (
                              <li key={p.id} role="option" aria-selected={selected}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setNpProfileId(p.id);
                                    setProfileDropdownOpen(false);
                                  }}
                                  className={`w-full px-4 py-3 text-left transition first:rounded-t-lg last:rounded-b-lg hover:bg-[var(--surface)] ${
                                    selected
                                      ? "bg-[var(--surface)] ring-1 ring-inset ring-[var(--primary)]"
                                      : ""
                                  }`}
                                >
                                  {(p.cityName || p.warehouseNumber || p.warehouseType) && (
                                    <div className="font-medium text-zinc-800">
                                      {[p.cityName, p.warehouseNumber || p.warehouseType]
                                        .filter(Boolean)
                                        .join(", ")}
                                    </div>
                                  )}
                                  <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-sm text-zinc-500">
                                    <span>{recipient}</span>
                                    {p.phone && (
                                      <>
                                        <span className="text-zinc-300">·</span>
                                        <span>{p.phone}</span>
                                      </>
                                    )}
                                  </div>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}

              {(npAddressMode === "new" || shippingProfiles.length === 0) && (
                <>
                  <div>
                    <p className="mb-2 text-sm font-medium text-zinc-700">Тип отримувача</p>
                    <div className="flex gap-4">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="radio"
                          name="npRecipientType"
                          checked={npRecipientType === "PERSON"}
                          onChange={() => setNpRecipientType("PERSON")}
                          className="h-4 w-4"
                        />
                        <span className="text-sm">Фізична особа</span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="radio"
                          name="npRecipientType"
                          checked={npRecipientType === "COMPANY"}
                          onChange={() => setNpRecipientType("COMPANY")}
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
                          checked={npDeliveryType === "WAREHOUSE"}
                          onChange={() => {
                            setNpDeliveryType("WAREHOUSE");
                            setNpStreetSelected(null);
                            setNpStreetQuery("");
                          }}
                          className="h-4 w-4"
                        />
                        <span className="text-sm">Відділення</span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="radio"
                          name="npDeliveryType"
                          checked={npDeliveryType === "POSTOMAT"}
                          onChange={() => {
                            setNpDeliveryType("POSTOMAT");
                            setNpStreetSelected(null);
                            setNpStreetQuery("");
                          }}
                          className="h-4 w-4"
                        />
                        <span className="text-sm">Поштомат</span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="radio"
                          name="npDeliveryType"
                          checked={npDeliveryType === "ADDRESS"}
                          onChange={() => {
                            setNpDeliveryType("ADDRESS");
                            setNpWarehouseSelected(null);
                            setNpWarehouseQuery("");
                          }}
                          className="h-4 w-4"
                        />
                        <span className="text-sm">Адреса</span>
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-600">Місто *</label>
                    <input
                      type="text"
                      value={npCitySelected ? npCityDisplayLabel(npCitySelected) : npCityQuery}
                      onChange={(e) => {
                        setNpCityQuery(e.target.value);
                        setNpCitySelected(null);
                        setNpWarehouseSelected(null);
                        setNpWarehouseQuery("");
                        setNpStreetSelected(null);
                        setNpStreetQuery("");
                      }}
                      onFocus={() => npCitySelected && setNpCityQuery(npCityDisplayLabel(npCitySelected))}
                      placeholder="Почніть вводити назву"
                      className={inputClass}
                    />
                    {npCityOptions.length > 0 && !npCitySelected && (
                      <ul className="mt-1 max-h-40 overflow-auto rounded-lg border border-[var(--border)] bg-white py-1">
                        {npCityOptions.map((c) => (
                          <li key={c.ref}>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface)]"
                              onClick={() => {
                                setNpCitySelected(c);
                                setNpCityQuery(npCityDisplayLabel(c));
                                setNpCityOptions([]);
                              }}
                            >
                              {npCityDisplayLabel(c)}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {(npDeliveryType === "WAREHOUSE" || npDeliveryType === "POSTOMAT") && (
                    <div>
                      <label className="block text-sm text-zinc-600">
                        {npDeliveryType === "POSTOMAT" ? "Поштомат *" : "Відділення *"}
                      </label>
                      <input
                        type="text"
                        value={npWarehouseSelected ? npWarehouseSelected.description : npWarehouseQuery}
                        onChange={(e) => {
                          setNpWarehouseQuery(e.target.value);
                          setNpWarehouseSelected(null);
                        }}
                        onFocus={() =>
                          npWarehouseSelected && setNpWarehouseQuery(npWarehouseSelected.description)
                        }
                        placeholder={
                          npCitySelected
                            ? npDeliveryType === "POSTOMAT"
                              ? "Номер або назва поштомата"
                              : "Номер або назва відділення"
                            : "Спочатку оберіть місто"
                        }
                        disabled={!npCitySelected}
                        className={inputClass}
                      />
                      {npWarehouseOptions.length > 0 && !npWarehouseSelected && npCitySelected && (
                        <ul className="mt-1 max-h-40 overflow-auto rounded-lg border border-[var(--border)] bg-white py-1">
                          {npWarehouseOptions.map((w) => (
                            <li key={w.ref}>
                              <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface)]"
                                onClick={() => {
                                  setNpWarehouseSelected(w);
                                  setNpWarehouseQuery(w.description);
                                  setNpWarehouseOptions([]);
                                }}
                              >
                                {w.description}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {npDeliveryType === "ADDRESS" && (
                    <>
                      <div>
                        <label className="block text-sm text-zinc-600">Вулиця *</label>
                        <input
                          type="text"
                          value={npStreetSelected ? npStreetSelected.street : npStreetQuery}
                          onChange={(e) => {
                            setNpStreetQuery(e.target.value);
                            setNpStreetSelected(null);
                            setNpStreetEmptyMessage(null);
                          }}
                          onFocus={() => npStreetSelected && setNpStreetQuery(npStreetSelected.street)}
                          placeholder="Мін. 3 символи"
                          disabled={!npCitySelected}
                          className={inputClass}
                        />
                        {npStreetsSyncing && npStreetQuery.trim().length >= 3 && (
                          <p className="mt-1 text-sm text-zinc-500">
                            Завантаження списку вулиць…
                          </p>
                        )}
                        {npStreetEmptyMessage && npStreetQuery.trim().length >= 3 && !npStreetSelected && (
                          <div className="mt-1 space-y-1">
                            <p className="text-sm text-zinc-600">{npStreetEmptyMessage}</p>
                            <button
                              type="button"
                              className="text-sm text-[var(--primary)] hover:underline"
                              onClick={() => {
                                if (!npCitySelected?.ref) return;
                                getNpStreets(npCitySelected.ref, "", 20, true)
                                  .then((r) => {
                                    setNpStreetOptions(r.items ?? []);
                                    setNpStreetEmptyMessage(null);
                                  })
                                  .catch(() => {});
                              }}
                            >
                              Переглянути вулиці за абеткою
                            </button>
                          </div>
                        )}
                        {npStreetOptions.length > 0 && !npStreetSelected && npCitySelected && (
                          <ul className="mt-1 max-h-40 overflow-auto rounded-lg border border-[var(--border)] bg-white py-1">
                            {npStreetOptions.map((s) => (
                              <li key={s.ref}>
                                <button
                                  type="button"
                                  className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface)]"
                                  onClick={() => {
                                    setNpStreetSelected(s);
                                    setNpStreetQuery(s.street);
                                    setNpStreetOptions([]);
                                  }}
                                >
                                  {s.street}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm text-zinc-600">Номер будинку *</label>
                          <input
                            type="text"
                            value={npBuilding}
                            onChange={(e) => setNpBuilding(e.target.value)}
                            placeholder="1"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-zinc-600">Квартира</label>
                          <input
                            type="text"
                            value={npFlat}
                            onChange={(e) => setNpFlat(e.target.value)}
                            placeholder="Необовʼязково"
                            className={inputClass}
                          />
                        </div>
                      </div>
                    </>
                  )}
                  {npRecipientType === "PERSON" ? (
                    <>
                      <div>
                        <label className="block text-sm text-zinc-600">Прізвище отримувача *</label>
                        <input
                          type="text"
                          value={npRecipientLastName}
                          onChange={(e) => setNpRecipientLastName(e.target.value)}
                          placeholder="Прізвище"
                          className={inputClass}
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
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-zinc-600">Контактна особа (ПІБ) *</label>
                        <div className="mt-1 grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={npContactPersonFirstName}
                            onChange={(e) => setNpContactPersonFirstName(e.target.value)}
                            placeholder="Ім'я"
                            className={inputClass}
                          />
                          <input
                            type="text"
                            value={npContactPersonLastName}
                            onChange={(e) => setNpContactPersonLastName(e.target.value)}
                            placeholder="Прізвище"
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm text-zinc-600">Телефон контактної особи *</label>
                        <input
                          type="tel"
                          value={npContactPersonPhone}
                          onChange={(e) => setNpContactPersonPhone(e.target.value)}
                          placeholder="0XXXXXXXXX"
                          className={inputClass}
                        />
                      </div>
                    </>
                  )}
                  {loggedIn && (
                    <>
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={npSaveAsProfile}
                          onChange={(e) => setNpSaveAsProfile(e.target.checked)}
                          className="h-4 w-4 rounded border-zinc-300"
                        />
                        <span className="text-sm text-zinc-700">Зберегти адресу для наступних замовлень</span>
                      </label>
                      {npSaveAsProfile && (
                        <div>
                          <label className="block text-sm text-zinc-600">Назва профілю (необовʼязково)</label>
                          <input
                            type="text"
                            value={npProfileLabel}
                            onChange={(e) => setNpProfileLabel(e.target.value)}
                            placeholder="Наприклад: Дім, Офіс"
                            className={inputClass}
                          />
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-700">Коментар</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className={inputClass}
            />
          </div>
          <Button type="submit" disabled={submitting} className="w-full min-h-[48px] sm:min-h-[44px]">
            {submitting ? "Оформлення…" : "Підтвердити замовлення"}
          </Button>
        </form>
      </div>
    </div>
  );
}
