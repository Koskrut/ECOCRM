// apps/web/src/app/employees/EmployeeModal.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { EntityModalShell } from "@/components/modals/EntityModalShell";
import { strings } from "@/locales";
import { apiHttp } from "../../lib/api/client";
import { RouteAddressInput } from "./RouteAddressInput";
import { useRouteAddressField } from "./useRouteAddressField";

const t = strings.employees.modal;

const labelClass = "block text-sm font-medium text-zinc-700";
const controlClass =
  "mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-zinc-400 disabled:bg-zinc-100";

export type Employee = {
  id: string;
  email: string;
  fullName?: string | null;
  role: "ADMIN" | "LEAD" | "MANAGER" | "WAREHOUSE" | "USER";
  routeStartLat?: number | null;
  routeStartLng?: number | null;
  routeEndLat?: number | null;
  routeEndLng?: number | null;
  routeStartLabel?: string | null;
  routeEndLabel?: string | null;
  leadId?: string | null;
  fieldProfile?: {
    fuelLitersPer100km?: number;
    fuelPricePerLiter?: string | number | null;
    vehicleLabel?: string | null;
  } | null;
};

type GoogleMapsPublicConfig = {
  mapsApiKey: string | null;
};

function parseCoord(s: string): number | null | undefined {
  const trimmed = s.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function pickMessage(e: unknown, fallback: string) {
  const anyErr = e as { response?: { data?: { message?: string; error?: string } } };
  return (
    anyErr?.response?.data?.message ||
    anyErr?.response?.data?.error ||
    (e instanceof Error ? e.message : fallback)
  );
}

const ROLE_OPTIONS: Array<{ value: Employee["role"]; label: string }> = [
  { value: "USER", label: t.roleUser },
  { value: "WAREHOUSE", label: t.roleWarehouse },
  { value: "LEAD", label: t.roleLead },
  { value: "MANAGER", label: t.roleManager },
  { value: "ADMIN", label: t.roleAdmin },
];

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
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Employee["role"]>("USER");
  const [password, setPassword] = useState("");
  const [leadId, setLeadId] = useState("");
  const [fuelLitersPer100km, setFuelLitersPer100km] = useState("8");
  const [fuelPricePerLiter, setFuelPricePerLiter] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mapsApiKey, setMapsApiKey] = useState<string | null>(null);
  const [mapsConfigError, setMapsConfigError] = useState<string | null>(null);

  const routeStart = useRouteAddressField(mapsApiKey, open);
  const routeEnd = useRouteAddressField(mapsApiKey, open);

  const canDelete = useMemo(() => mode === "edit" && !!initial?.id, [mode, initial?.id]);
  const showFieldSettings = mode === "edit" && !!initial?.id;

  const hasCoords =
    routeStart.lat.trim() !== "" ||
    routeStart.lng.trim() !== "" ||
    routeEnd.lat.trim() !== "" ||
    routeEnd.lng.trim() !== "";

  useEffect(() => {
    if (!open) return;
    setError(null);

    if (mode === "edit" && initial) {
      setEmail(initial.email ?? "");
      setFullName(initial.fullName ?? "");
      setRole(initial.role ?? "USER");
      setPassword("");
      routeStart.reset({
        label: initial.routeStartLabel ?? "",
        lat: initial.routeStartLat != null ? String(initial.routeStartLat) : "",
        lng: initial.routeStartLng != null ? String(initial.routeStartLng) : "",
      });
      routeEnd.reset({
        label: initial.routeEndLabel ?? "",
        lat: initial.routeEndLat != null ? String(initial.routeEndLat) : "",
        lng: initial.routeEndLng != null ? String(initial.routeEndLng) : "",
      });
      setLeadId(initial.leadId ?? "");
      const fp = initial.fieldProfile;
      setFuelLitersPer100km(
        fp?.fuelLitersPer100km != null ? String(fp.fuelLitersPer100km) : "8",
      );
      setFuelPricePerLiter(
        fp?.fuelPricePerLiter != null ? String(fp.fuelPricePerLiter) : "",
      );
    } else {
      setEmail("");
      setFullName("");
      setRole("USER");
      setPassword("");
      routeStart.reset({});
      routeEnd.reset({});
      setLeadId("");
      setFuelLitersPer100km("8");
      setFuelPricePerLiter("");
    }
    // routeStart/routeEnd reset is stable per open cycle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, initial]);

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

  const validateCoord = (fieldLabel: string, s: string) => {
    const trimmed = s.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed.replace(",", "."));
    return Number.isFinite(n) ? null : t.coordsInvalid(fieldLabel);
  };

  const validate = () => {
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

    if (mode === "create") {
      if (email.trim().length === 0) return t.emailRequired;
      if (!email.includes("@")) return t.emailInvalid;
      if (password.trim().length < 6) return t.passwordMin;
    }
    if (mode === "edit" && password.trim().length > 0 && password.trim().length < 6) {
      return t.passwordMin;
    }

    if (showFieldSettings) {
      const liters = Number(fuelLitersPer100km.replace(",", "."));
      if (!Number.isFinite(liters) || liters <= 0) return t.fuelConsumptionInvalid;
      const priceT = fuelPricePerLiter.trim();
      if (priceT !== "") {
        const price = Number(priceT.replace(",", "."));
        if (!Number.isFinite(price) || price < 0) return t.fuelPriceInvalid;
      }
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
        await apiHttp.post("/users", {
          email: email.trim(),
          fullName: fullName.trim() || null,
          password: password.trim(),
          role,
        });
      } else {
        if (!initial?.id) throw new Error("Missing user id");

        const payload: {
          email: string;
          fullName: string | null;
          password?: string;
          role: Employee["role"];
        } = {
          email: email.trim(),
          fullName: fullName.trim() || null,
          role,
        };
        if (password.trim().length > 0) payload.password = password.trim();

        const liters = Number(fuelLitersPer100km.replace(",", "."));
        const priceTrim = fuelPricePerLiter.trim();
        await apiHttp.patch(`/users/${initial.id}`, {
          ...payload,
          routeStartLat: parseCoord(routeStart.lat),
          routeStartLng: parseCoord(routeStart.lng),
          routeEndLat: parseCoord(routeEnd.lat),
          routeEndLng: parseCoord(routeEnd.lng),
          routeStartLabel: routeStart.label.trim() || null,
          routeEndLabel: routeEnd.label.trim() || null,
          leadId: leadId || null,
          fuelLitersPer100km: liters,
          fuelPricePerLiter: priceTrim ? Number(priceTrim.replace(",", ".")) : null,
        });

        await apiHttp.patch(`/users/${initial.id}/role`, { role });
      }

      onSaved();
      onClose();
    } catch (e) {
      setError(pickMessage(e, t.failed));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!initial?.id) return;
    if (!confirm(t.deleteConfirm(initial.email))) return;

    setSaving(true);
    setError(null);

    try {
      await apiHttp.delete(`/users/${initial.id}`);
      onSaved();
      onClose();
    } catch (e) {
      setError(pickMessage(e, t.failed));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const title = mode === "create" ? t.createTitle : t.editTitle;
  const subtitle =
    mode === "edit" && initial?.email ? (
      <span className="truncate" title={initial.email}>
        {initial.email}
      </span>
    ) : (
      t.editSubtitle
    );

  const mapsHint = mapsConfigError;

  const formBody = (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t.sectionAccount}</h3>
        <div className="mt-3 space-y-3">
          <div>
            <label className={labelClass}>{t.email}</label>
            {mode === "edit" ? (
              <p className="mt-0.5 text-xs text-zinc-500">{t.emailLoginHint}</p>
            ) : null}
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
            <label className={labelClass}>
              {mode === "create" ? t.password : t.passwordOptional}
            </label>
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
              onChange={(e) => setRole(e.target.value as Employee["role"])}
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
        </div>
      </section>

      {showFieldSettings ? (
        <details className="rounded-lg border border-zinc-200 bg-zinc-50/50" open>
          <summary className="cursor-pointer px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-zinc-600">
            {t.sectionField}
          </summary>
          <div className="space-y-4 border-t border-zinc-200 px-3 py-3">
            <div>
              <h4 className="text-sm font-semibold text-zinc-900">{t.routeTitle}</h4>
              <p className="mt-0.5 text-xs text-zinc-500">{t.routeHint}</p>
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

              <details className="mt-3 rounded-md border border-zinc-200 bg-white">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-zinc-600">
                  {t.coordsAdvanced}
                  {hasCoords ? (
                    <span className="ml-2 font-normal text-emerald-700">· {t.coordsSet}</span>
                  ) : null}
                </summary>
                <p className="border-t border-zinc-100 px-3 pt-2 text-xs text-zinc-500">{t.coordsHint}</p>
                <div className="grid grid-cols-2 gap-2 px-3 py-3">
                  <div>
                    <label className="text-xs text-zinc-600">{t.routeStart} — {t.lat}</label>
                    <input
                      className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                      value={routeStart.lat}
                      onChange={(e) => routeStart.setLat(e.target.value)}
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-600">{t.routeStart} — {t.lng}</label>
                    <input
                      className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                      value={routeStart.lng}
                      onChange={(e) => routeStart.setLng(e.target.value)}
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-600">{t.routeEnd} — {t.lat}</label>
                    <input
                      className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                      value={routeEnd.lat}
                      onChange={(e) => routeEnd.setLat(e.target.value)}
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-600">{t.routeEnd} — {t.lng}</label>
                    <input
                      className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                      value={routeEnd.lng}
                      onChange={(e) => routeEnd.setLng(e.target.value)}
                      disabled={saving}
                    />
                  </div>
                </div>
              </details>
            </div>

            <div>
              <label className={labelClass}>{t.reportsTo}</label>
              <p className="mt-0.5 text-xs text-zinc-500">{t.reportsToHint}</p>
              <select
                className={controlClass}
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
                disabled={saving}
              >
                <option value="">{t.reportsToNone}</option>
                {allEmployees
                  .filter(
                    (u) =>
                      u.id !== initial?.id && (u.role === "LEAD" || u.role === "ADMIN"),
                  )
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName || u.email}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-zinc-900">{t.fuelTitle}</h4>
              <p className="mt-0.5 text-xs text-zinc-500">{t.fuelHint}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
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
            </div>
          </div>
        </details>
      ) : null}
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
          onClick={onClose}
          disabled={saving}
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          {t.cancel}
        </button>
        <button type="button" onClick={() => void save()} disabled={saving} className="btn-primary">
          {saving ? t.saving : t.save}
        </button>
      </div>
    </div>
  );

  return (
    <EntityModalShell
      size="compact"
      title={title}
      subtitle={mode === "edit" ? subtitle : undefined}
      left={formBody}
      footer={footer}
      canClose={!saving}
      onClose={onClose}
    />
  );
}
