// apps/web/src/app/employees/EmployeeModal.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EntityModalShell } from "@/components/modals/EntityModalShell";
import { EntitySection } from "@/components/sections/EntitySection";
import { PageLoading } from "@/components/feedback";
import { useConfirm, useToast } from "@/components/feedback";
import { EmployeeDayPlanSection } from "@/components/day-plan/EmployeeDayPlanSection";
import { EmployeeAccessSection } from "@/components/users/EmployeeAccessSection";
import { strings } from "@/locales";
import { getUserFriendlyApiError } from "@/lib/api/errors";
import { apiHttp } from "../../lib/api/client";
import { usersApi, type User, type UserRole } from "@/lib/api/resources/users";
import { formatDateTime } from "@/lib/crmDatetime";
import { RouteAddressInput } from "./RouteAddressInput";
import { useRouteAddressField } from "./useRouteAddressField";

export type Employee = User;

const t = strings.employees.modal;

const labelClass = "block text-sm font-medium text-zinc-700";
const controlClass =
  "mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-zinc-400 disabled:bg-zinc-100";

type GoogleMapsPublicConfig = {
  mapsApiKey: string | null;
};

type TabId = "account" | "field" | "dayPlan" | "access";

type FormSnapshot = {
  email: string;
  fullName: string;
  username: string;
  role: UserRole;
  isActive: boolean;
  leadId: string;
  fuelLitersPer100km: string;
  fuelPricePerLiter: string;
  vehicleLabel: string;
  usePersonalCar: boolean;
  routeStartLabel: string;
  routeStartLat: string;
  routeStartLng: string;
  routeEndLabel: string;
  routeEndLat: string;
  routeEndLng: string;
};

const ROLE_OPTIONS: Array<{ value: UserRole; label: string }> = [
  { value: "USER", label: t.roleUser },
  { value: "WAREHOUSE", label: t.roleWarehouse },
  { value: "LEAD", label: t.roleLead },
  { value: "MANAGER", label: t.roleManager },
  { value: "ADMIN", label: t.roleAdmin },
];

function parseCoord(s: string): number | null | undefined {
  const trimmed = s.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function snapshotFromForm(
  email: string,
  fullName: string,
  username: string,
  role: UserRole,
  isActive: boolean,
  leadId: string,
  fuelLitersPer100km: string,
  fuelPricePerLiter: string,
  vehicleLabel: string,
  usePersonalCar: boolean,
  routeStart: { label: string; lat: string; lng: string },
  routeEnd: { label: string; lat: string; lng: string },
): FormSnapshot {
  return {
    email: email.trim(),
    fullName: fullName.trim(),
    username: username.trim(),
    role,
    isActive,
    leadId,
    fuelLitersPer100km: fuelLitersPer100km.trim(),
    fuelPricePerLiter: fuelPricePerLiter.trim(),
    vehicleLabel: vehicleLabel.trim(),
    usePersonalCar,
    routeStartLabel: routeStart.label.trim(),
    routeStartLat: routeStart.lat.trim(),
    routeStartLng: routeStart.lng.trim(),
    routeEndLabel: routeEnd.label.trim(),
    routeEndLat: routeEnd.lat.trim(),
    routeEndLng: routeEnd.lng.trim(),
  };
}

export function EmployeeModal({
  open,
  mode,
  initial,
  allEmployees,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  initial: Employee | null;
  allEmployees: Employee[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { confirm } = useConfirm();
  const { pushToast } = useToast();

  const [activeTab, setActiveTab] = useState<TabId>("account");
  const [loadedUser, setLoadedUser] = useState<Employee | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<UserRole>("USER");
  const [isActive, setIsActive] = useState(true);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [initialRole, setInitialRole] = useState<UserRole>("USER");
  const [leadId, setLeadId] = useState("");
  const [fuelLitersPer100km, setFuelLitersPer100km] = useState("8");
  const [fuelPricePerLiter, setFuelPricePerLiter] = useState("");
  const [vehicleLabel, setVehicleLabel] = useState("");
  const [usePersonalCar, setUsePersonalCar] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actorRole, setActorRole] = useState<string | null>(null);

  const [mapsApiKey, setMapsApiKey] = useState<string | null>(null);
  const [mapsConfigError, setMapsConfigError] = useState<string | null>(null);

  const initialSnapshotRef = useRef<string>("");
  const [dayPlanMounted, setDayPlanMounted] = useState(false);
  const routeStartResetRef = useRef<(next: { label?: string; lat?: string; lng?: string }) => void>(() => {});
  const routeEndResetRef = useRef<(next: { label?: string; lat?: string; lng?: string }) => void>(() => {});
  const loadedUserIdRef = useRef<string | null>(null);

  const routeStart = useRouteAddressField(mapsApiKey, open);
  const routeEnd = useRouteAddressField(mapsApiKey, open);

  routeStartResetRef.current = routeStart.reset;
  routeEndResetRef.current = routeEnd.reset;

  const userId = mode === "edit" ? (initial?.id ?? loadedUser?.id) : null;
  const canDelete = mode === "edit" && !!userId;
  const showFieldTab = mode === "edit" && !!userId;
  const showDayPlanTab = mode === "edit" && !!userId && (actorRole === "ADMIN" || actorRole === "LEAD");
  const showAccessTab = mode === "edit" && !!userId && actorRole === "ADMIN";

  const hasCoords =
    routeStart.lat.trim() !== "" ||
    routeStart.lng.trim() !== "" ||
    routeEnd.lat.trim() !== "" ||
    routeEnd.lng.trim() !== "";

  const currentSnapshot = useMemo(
    () =>
      snapshotFromForm(
        email,
        fullName,
        username,
        role,
        isActive,
        leadId,
        fuelLitersPer100km,
        fuelPricePerLiter,
        vehicleLabel,
        usePersonalCar,
        routeStart,
        routeEnd,
      ),
    [
      email,
      fullName,
      username,
      role,
      isActive,
      leadId,
      fuelLitersPer100km,
      fuelPricePerLiter,
      vehicleLabel,
      usePersonalCar,
      routeStart.label,
      routeStart.lat,
      routeStart.lng,
      routeEnd.label,
      routeEnd.lat,
      routeEnd.lng,
    ],
  );

  const isDirty = useMemo(() => {
    if (mode === "create") {
      return (
        email.trim() !== "" ||
        fullName.trim() !== "" ||
        username.trim() !== "" ||
        password.trim() !== "" ||
        role !== "USER"
      );
    }
    return JSON.stringify(currentSnapshot) !== initialSnapshotRef.current;
  }, [mode, email, fullName, username, password, role, currentSnapshot]);

  const applyUserToForm = useCallback((user: Employee) => {
    setEmail(user.email ?? "");
    setFullName(user.fullName ?? "");
    setUsername(user.username ?? "");
    setRole(user.role ?? "USER");
    setInitialRole(user.role ?? "USER");
    setIsActive(user.isActive !== false);
    setCreatedAt(user.createdAt ?? null);
    setPassword("");
    routeStartResetRef.current({
      label: user.routeStartLabel ?? "",
      lat: user.routeStartLat != null ? String(user.routeStartLat) : "",
      lng: user.routeStartLng != null ? String(user.routeStartLng) : "",
    });
    routeEndResetRef.current({
      label: user.routeEndLabel ?? "",
      lat: user.routeEndLat != null ? String(user.routeEndLat) : "",
      lng: user.routeEndLng != null ? String(user.routeEndLng) : "",
    });
    setLeadId(user.leadId ?? "");
    const fp = user.fieldProfile;
    setFuelLitersPer100km(fp?.fuelLitersPer100km != null ? String(fp.fuelLitersPer100km) : "8");
    setFuelPricePerLiter(fp?.fuelPricePerLiter != null ? String(fp.fuelPricePerLiter) : "");
    setVehicleLabel(fp?.vehicleLabel ?? "");
    setUsePersonalCar(fp?.usePersonalCar !== false);

    const snap = snapshotFromForm(
      user.email ?? "",
      user.fullName ?? "",
      user.username ?? "",
      user.role ?? "USER",
      user.isActive !== false,
      user.leadId ?? "",
      fp?.fuelLitersPer100km != null ? String(fp.fuelLitersPer100km) : "8",
      fp?.fuelPricePerLiter != null ? String(fp.fuelPricePerLiter) : "",
      fp?.vehicleLabel ?? "",
      fp?.usePersonalCar !== false,
      {
        label: user.routeStartLabel ?? "",
        lat: user.routeStartLat != null ? String(user.routeStartLat) : "",
        lng: user.routeStartLng != null ? String(user.routeStartLng) : "",
      },
      {
        label: user.routeEndLabel ?? "",
        lat: user.routeEndLat != null ? String(user.routeEndLat) : "",
        lng: user.routeEndLng != null ? String(user.routeEndLng) : "",
      },
    );
    initialSnapshotRef.current = JSON.stringify(snap);
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setActiveTab("account");
    setDayPlanMounted(false);

    if (mode === "create") {
      loadedUserIdRef.current = null;
      setLoadedUser(null);
      setEmail("");
      setFullName("");
      setUsername("");
      setRole("USER");
      setInitialRole("USER");
      setIsActive(true);
      setCreatedAt(null);
      setPassword("");
      routeStartResetRef.current({});
      routeEndResetRef.current({});
      setLeadId("");
      setFuelLitersPer100km("8");
      setFuelPricePerLiter("");
      setVehicleLabel("");
      setUsePersonalCar(true);
      initialSnapshotRef.current = "";
      setLoadingUser(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  useEffect(() => {
    if (!open || mode !== "edit" || !initial?.id) return;
    if (loadedUserIdRef.current === initial.id) return;

    loadedUserIdRef.current = initial.id;
    setLoadedUser(initial);
    applyUserToForm(initial);

    let cancelled = false;
    setLoadingUser(true);
    setError(null);
    void usersApi
      .get(initial.id)
      .then((user) => {
        if (cancelled) return;
        setLoadedUser(user);
        applyUserToForm(user);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(getUserFriendlyApiError(e, t.failed));
      })
      .finally(() => {
        if (!cancelled) setLoadingUser(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, mode, initial?.id, applyUserToForm]);

  useEffect(() => {
    if (!open) {
      loadedUserIdRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void apiHttp
      .get<GoogleMapsPublicConfig>("/settings/google-maps/public")
      .then((res) => {
        const key = res.data?.mapsApiKey ?? null;
        setMapsApiKey(key);
        setMapsConfigError(key ? null : t.mapsConfigMissing);
      })
      .catch(() => {
        setMapsApiKey(null);
        setMapsConfigError(t.mapsConfigFailed);
      });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((r) => setActorRole(r.data?.user?.role ?? null))
      .catch(() => setActorRole(null));
  }, [open]);

  const validateCoord = (fieldLabel: string, s: string) => {
    const trimmed = s.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed.replace(",", "."));
    return Number.isFinite(n) ? null : t.coordsInvalid(fieldLabel);
  };

  const validate = () => {
    if (mode === "edit" && showFieldTab) {
      const e1 = validateCoord(t.lat, routeStart.lat);
      if (e1) return e1;
      const e2 = validateCoord(t.lng, routeStart.lng);
      if (e2) return e2;
      const e3 = validateCoord(t.lat, routeEnd.lat);
      if (e3) return e3;
      const e4 = validateCoord(t.lng, routeEnd.lng);
      if (e4) return e4;

      if (
        (routeStart.lat.trim() !== "") !== (routeStart.lng.trim() !== "") ||
        (routeEnd.lat.trim() !== "") !== (routeEnd.lng.trim() !== "")
      ) {
        return t.coordsPairRequired;
      }

      const liters = Number(fuelLitersPer100km.replace(",", "."));
      if (!Number.isFinite(liters) || liters <= 0) return t.fuelConsumptionInvalid;
      const priceT = fuelPricePerLiter.trim();
      if (priceT !== "") {
        const price = Number(priceT.replace(",", "."));
        if (!Number.isFinite(price) || price < 0) return t.fuelPriceInvalid;
      }
    }

    if (mode === "create") {
      if (email.trim().length === 0) return t.emailRequired;
      if (!email.includes("@")) return t.emailInvalid;
      if (password.trim().length < 6) return t.passwordMin;
    }
    if (mode === "edit" && password.trim().length > 0 && password.trim().length < 6) {
      return t.passwordMin;
    }

    return null;
  };

  const save = async () => {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (mode === "create") {
        await usersApi.create({
          email: email.trim(),
          fullName: fullName.trim() || null,
          username: username.trim() || undefined,
          password: password.trim(),
          role,
          isActive,
        });
      } else {
        if (!userId) throw new Error("Missing user id");

        const liters = Number(fuelLitersPer100km.replace(",", "."));
        const priceTrim = fuelPricePerLiter.trim();
        await usersApi.update(userId, {
          email: email.trim(),
          fullName: fullName.trim() || null,
          username: username.trim() || null,
          ...(password.trim().length > 0 ? { password: password.trim() } : {}),
          isActive,
          routeStartLat: parseCoord(routeStart.lat),
          routeStartLng: parseCoord(routeStart.lng),
          routeEndLat: parseCoord(routeEnd.lat),
          routeEndLng: parseCoord(routeEnd.lng),
          routeStartLabel: routeStart.label.trim() || null,
          routeEndLabel: routeEnd.label.trim() || null,
          leadId: leadId || null,
          fuelLitersPer100km: liters,
          fuelPricePerLiter: priceTrim ? Number(priceTrim.replace(",", ".")) : null,
          vehicleLabel: vehicleLabel.trim() || null,
          usePersonalCar,
        });
        if (role !== initialRole) {
          await usersApi.updateRole(userId, role);
        }
        const refreshed = await usersApi.get(userId);
        setLoadedUser(refreshed);
        applyUserToForm({ ...refreshed, role });
        setInitialRole(role);
      }

      pushToast(t.saved, "success");
      onSaved();
      onClose();
    } catch (e) {
      setError(getUserFriendlyApiError(e, t.failed));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!userId) return;
    const ok = await confirm({
      title: t.deleteTitle,
      message: t.deleteConfirm(email),
      destructive: true,
      confirmText: t.delete,
    });
    if (!ok) return;

    setSaving(true);
    setError(null);

    try {
      await usersApi.remove(userId);
      onSaved();
      onClose();
    } catch (e) {
      setError(getUserFriendlyApiError(e, t.failed));
    } finally {
      setSaving(false);
    }
  };

  const requestClose = useCallback(async () => {
    if (saving) return;
    if (isDirty) {
      const ok = await confirm({
        title: t.discardTitle,
        message: t.discardMessage,
        confirmText: t.discardConfirm,
        destructive: true,
      });
      if (!ok) return;
    }
    onClose();
  }, [saving, isDirty, confirm, onClose]);

  const handleEscape = useCallback(() => {
    if (saving) return true;
    void requestClose();
    return true;
  }, [saving, requestClose]);

  if (!open) return null;

  const title = mode === "create" ? t.createTitle : t.editTitle;
  const subtitle =
    mode === "edit" && email ? (
      <span className="truncate" title={email}>
        {email}
      </span>
    ) : (
      t.editSubtitle
    );

  const mapsHint = mapsConfigError;

  const accountSection = (
    <EntitySection title={t.sectionAccount}>
      <div className="space-y-3">
        <div>
          <label className={labelClass}>{t.email}</label>
          {mode === "edit" ? <p className="mt-0.5 text-xs text-zinc-500">{t.emailLoginHint}</p> : null}
          <input
            type="email"
            className={controlClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={saving}
            placeholder="user@company.com"
            autoComplete="off"
          />
        </div>

        <div>
          <label className={labelClass}>{t.fullName}</label>
          <input
            className={controlClass}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={saving}
            placeholder="John Doe"
            autoComplete="name"
          />
        </div>

        <div>
          <label className={labelClass}>{t.username}</label>
          <p className="mt-0.5 text-xs text-zinc-500">{t.usernameHint}</p>
          <input
            className={controlClass}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={saving}
            autoComplete="username"
          />
        </div>

        <div>
          <label className={labelClass}>{mode === "create" ? t.password : t.passwordOptional}</label>
          {mode === "edit" ? (
            <p className="mt-0.5 text-xs text-zinc-500">{t.passwordOptionalHint}</p>
          ) : null}
          <input
            className={controlClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={saving}
            placeholder={mode === "create" ? "••••••" : "••••••"}
            type="password"
            autoComplete="new-password"
          />
        </div>

        <div>
          <label className={labelClass}>{t.role}</label>
          <select
            className={controlClass}
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            disabled={saving}
            aria-label={t.role}
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            disabled={saving}
          />
          <span>
            <span className="text-sm font-medium text-zinc-900">{t.isActive}</span>
            <span className="mt-0.5 block text-xs text-zinc-500">{t.isActiveHint}</span>
          </span>
        </label>

        {mode === "edit" && createdAt ? (
          <div>
            <span className="text-xs font-medium text-zinc-500">{t.createdAt}</span>
            <p className="mt-0.5 text-sm text-zinc-700">{formatDateTime(createdAt)}</p>
          </div>
        ) : null}
      </div>
    </EntitySection>
  );

  const fieldSection = showFieldTab ? (
    <div className="space-y-4">
      <EntitySection title={t.routeTitle}>
        <p className="text-xs text-zinc-500">{t.routeHint}</p>
        <div className="mt-3 space-y-3">
          <RouteAddressInput
            label={t.routeStart}
            placeholder={t.routeStartPlaceholder}
            value={routeStart.label}
            disabled={saving}
            mapsApiKey={mapsApiKey}
            mapsConfigHint={mapsHint}
            suggestionsOpen={routeStart.suggestionsOpen}
            suggestions={routeStart.suggestions}
            lookupLoading={routeStart.lookupLoading}
            geocodeLoading={routeStart.geocodeLoading}
            error={routeStart.error}
            addressHint={routeStart.hint}
            onChange={routeStart.onLabelChange}
            onFocus={routeStart.onFocus}
            onBlur={routeStart.onBlur}
            onSelectSuggestion={(s) => void routeStart.selectSuggestion(s)}
            statusSearching={t.searchingAddresses}
            statusGeocoding={t.geocoding}
          />
          <RouteAddressInput
            label={t.routeEnd}
            descriptionHint={t.routeEndHint}
            placeholder={t.routeEndPlaceholder}
            value={routeEnd.label}
            disabled={saving}
            mapsApiKey={mapsApiKey}
            mapsConfigHint={mapsHint}
            suggestionsOpen={routeEnd.suggestionsOpen}
            suggestions={routeEnd.suggestions}
            lookupLoading={routeEnd.lookupLoading}
            geocodeLoading={routeEnd.geocodeLoading}
            error={routeEnd.error}
            addressHint={routeEnd.hint}
            onChange={routeEnd.onLabelChange}
            onFocus={routeEnd.onFocus}
            onBlur={routeEnd.onBlur}
            onSelectSuggestion={(s) => void routeEnd.selectSuggestion(s)}
            statusSearching={t.searchingAddresses}
            statusGeocoding={t.geocoding}
          />
        </div>

        <details className="mt-3 rounded-md border border-zinc-200 bg-zinc-50">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-zinc-600">
            {t.coordsAdvanced}
            {hasCoords ? <span className="ml-2 font-normal text-emerald-700">· {t.coordsSet}</span> : null}
          </summary>
          <p className="border-t border-zinc-100 px-3 pt-2 text-xs text-zinc-500">{t.coordsHint}</p>
          <div className="grid grid-cols-2 gap-2 px-3 py-3">
            <div>
              <label className="text-xs text-zinc-600">
                {t.routeStart} — {t.lat}
              </label>
              <input
                className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                value={routeStart.lat}
                onChange={(e) => routeStart.setLat(e.target.value)}
                disabled={saving}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-600">
                {t.routeStart} — {t.lng}
              </label>
              <input
                className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                value={routeStart.lng}
                onChange={(e) => routeStart.setLng(e.target.value)}
                disabled={saving}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-600">
                {t.routeEnd} — {t.lat}
              </label>
              <input
                className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                value={routeEnd.lat}
                onChange={(e) => routeEnd.setLat(e.target.value)}
                disabled={saving}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-600">
                {t.routeEnd} — {t.lng}
              </label>
              <input
                className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                value={routeEnd.lng}
                onChange={(e) => routeEnd.setLng(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>
        </details>
      </EntitySection>

      <EntitySection title={t.reportsTo}>
        <p className="text-xs text-zinc-500">{t.reportsToHint}</p>
        <select
          className={`${controlClass} mt-2`}
          value={leadId}
          onChange={(e) => setLeadId(e.target.value)}
          disabled={saving}
        >
          <option value="">{t.reportsToNone}</option>
          {allEmployees
            .filter((u) => u.id !== userId && (u.role === "LEAD" || u.role === "ADMIN"))
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName || u.email}
              </option>
            ))}
        </select>
      </EntitySection>

      <EntitySection title={t.fuelTitle}>
        <p className="text-xs text-zinc-500">{t.fuelHint}</p>
        <div className="mt-3">
          <label className={labelClass}>{t.vehicleLabel}</label>
          <input
            type="text"
            className={controlClass}
            value={vehicleLabel}
            onChange={(e) => setVehicleLabel(e.target.value)}
            disabled={saving}
            placeholder={t.vehicleLabelPlaceholder}
          />
        </div>
        <label className="mt-3 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={usePersonalCar}
            onChange={(e) => setUsePersonalCar(e.target.checked)}
            disabled={saving}
          />
          <span>
            <span className="text-sm font-medium text-zinc-900">{t.usePersonalCar}</span>
            <span className="mt-0.5 block text-xs text-zinc-500">{t.usePersonalCarHint}</span>
          </span>
        </label>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium text-zinc-700">{t.fuelConsumption}</label>
            <input
              type="text"
              inputMode="decimal"
              className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
              value={fuelLitersPer100km}
              onChange={(e) => setFuelLitersPer100km(e.target.value)}
              disabled={saving}
              placeholder="8"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-700">{t.fuelPrice}</label>
            <input
              type="text"
              inputMode="decimal"
              className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
              value={fuelPricePerLiter}
              onChange={(e) => setFuelPricePerLiter(e.target.value)}
              disabled={saving}
              placeholder={t.fuelPricePlaceholder}
            />
          </div>
        </div>
      </EntitySection>
    </div>
  ) : null;

  const tabBtnClass = (tab: TabId) =>
    `inline-flex items-center rounded px-2 py-1 text-sm font-medium ${
      activeTab === tab ? "bg-accent-gradient text-white" : "text-zinc-600 hover:bg-zinc-100"
    }`;

  const tabsUnderHeader =
    mode === "edit" ? (
      <div className="flex flex-wrap gap-1 border-b border-zinc-200 pb-2">
        <button type="button" onClick={() => setActiveTab("account")} className={tabBtnClass("account")}>
          {t.tabAccount}
        </button>
        {showFieldTab ? (
          <button type="button" onClick={() => setActiveTab("field")} className={tabBtnClass("field")}>
            {t.tabField}
          </button>
        ) : null}
        {showDayPlanTab ? (
          <button
            type="button"
            onClick={() => {
              setDayPlanMounted(true);
              setActiveTab("dayPlan");
            }}
            className={tabBtnClass("dayPlan")}
          >
            {t.tabDayPlan}
          </button>
        ) : null}
        {showAccessTab ? (
          <button type="button" onClick={() => setActiveTab("access")} className={tabBtnClass("access")}>
            {t.tabAccess}
          </button>
        ) : null}
      </div>
    ) : undefined;

  let tabBody: React.ReactNode;
  if (loadingUser && mode === "edit" && !email) {
    tabBody = <PageLoading inline />;
  } else if (mode === "create" || activeTab === "account") {
    tabBody = accountSection;
  } else if (activeTab === "field") {
    tabBody = fieldSection;
  } else if (activeTab === "dayPlan" && userId && dayPlanMounted) {
    tabBody = <EmployeeDayPlanSection userId={userId} fullName={fullName} />;
  } else if (activeTab === "access" && userId) {
    tabBody = (
      <EmployeeAccessSection userId={userId} userName={fullName || email} legacyRole={role} />
    );
  } else {
    tabBody = accountSection;
  }

  const formBody = (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}
      {tabBody}
    </div>
  );

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        {canDelete ? (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={saving}
            className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {t.delete}
          </button>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void requestClose()}
          disabled={saving}
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          {t.cancel}
        </button>
        {activeTab !== "dayPlan" && activeTab !== "access" ? (
          <button type="button" onClick={() => void save()} disabled={saving || loadingUser} className="btn-primary">
            {saving ? t.saving : t.save}
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <EntityModalShell
      size={mode === "edit" ? "default" : "compact"}
      title={title}
      subtitle={mode === "edit" ? subtitle : undefined}
      tabsUnderHeader={tabsUnderHeader}
      left={formBody}
      footer={footer}
      canClose={!saving}
      onClose={() => void requestClose()}
      onEscape={handleEscape}
    />
  );
}
