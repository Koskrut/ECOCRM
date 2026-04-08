// apps/web/src/app/employees/EmployeeModal.tsx
"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { apiHttp } from "../../lib/api/client";
import {
  autocompleteAddress,
  geocodePlace,
  geocodeText,
  mergeFormattedAddressWithUserDetail,
  type PlaceSuggestion,
} from "@/lib/googlePlacesNew";

export type Employee = {
  id: string;
  email: string;
  fullName?: string | null;
  role: "ADMIN" | "LEAD" | "MANAGER" | "USER";
  routeStartLat?: number | null;
  routeStartLng?: number | null;
  routeEndLat?: number | null;
  routeEndLng?: number | null;
  routeStartLabel?: string | null;
  routeEndLabel?: string | null;
  leadId?: string | null;
};

type GoogleMapsPublicConfig = {
  mapsApiKey: string | null;
};

function parseCoord(s: string): number | null | undefined {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
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
  /** For lead assignment dropdown */
  allEmployees: Employee[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const title = mode === "create" ? "Add employee" : "Edit employee";

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Employee["role"]>("USER");
  const [password, setPassword] = useState("");

  const [routeStartLat, setRouteStartLat] = useState("");
  const [routeStartLng, setRouteStartLng] = useState("");
  const [routeEndLat, setRouteEndLat] = useState("");
  const [routeEndLng, setRouteEndLng] = useState("");
  const [routeStartLabel, setRouteStartLabel] = useState("");
  const [routeEndLabel, setRouteEndLabel] = useState("");
  const [leadId, setLeadId] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mapsApiKey, setMapsApiKey] = useState<string | null>(null);
  const [mapsConfigError, setMapsConfigError] = useState<string | null>(null);

  const [startSuggestionsOpen, setStartSuggestionsOpen] = useState(false);
  const [startSuggestions, setStartSuggestions] = useState<PlaceSuggestion[]>([]);
  const [startLookupLoading, setStartLookupLoading] = useState(false);
  const [startGeocodeLoading, setStartGeocodeLoading] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const startBlurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startAutocompleteAbortRef = useRef<AbortController | null>(null);
  const lastStartGeocodedRef = useRef<string>("");

  const [endSuggestionsOpen, setEndSuggestionsOpen] = useState(false);
  const [endSuggestions, setEndSuggestions] = useState<PlaceSuggestion[]>([]);
  const [endLookupLoading, setEndLookupLoading] = useState(false);
  const [endGeocodeLoading, setEndGeocodeLoading] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const endBlurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endAutocompleteAbortRef = useRef<AbortController | null>(null);
  const lastEndGeocodedRef = useRef<string>("");

  const canDelete = useMemo(() => mode === "edit" && !!initial?.id, [mode, initial?.id]);

  useEffect(() => {
    if (!open) return;
    setError(null);

    if (mode === "edit" && initial) {
      setEmail(initial.email ?? "");
      setFullName(initial.fullName ?? "");
      setRole(initial.role ?? "USER");
      setPassword("");
      setRouteStartLat(initial.routeStartLat != null ? String(initial.routeStartLat) : "");
      setRouteStartLng(initial.routeStartLng != null ? String(initial.routeStartLng) : "");
      setRouteEndLat(initial.routeEndLat != null ? String(initial.routeEndLat) : "");
      setRouteEndLng(initial.routeEndLng != null ? String(initial.routeEndLng) : "");
      setRouteStartLabel(initial.routeStartLabel ?? "");
      setRouteEndLabel(initial.routeEndLabel ?? "");
      setLeadId(initial.leadId ?? "");
    } else {
      setEmail("");
      setFullName("");
      setRole("USER");
      setPassword("");
      setRouteStartLat("");
      setRouteStartLng("");
      setRouteEndLat("");
      setRouteEndLng("");
      setRouteStartLabel("");
      setRouteEndLabel("");
      setLeadId("");
    }
  }, [open, mode, initial]);

  useEffect(() => {
    if (!open) return;
    void apiHttp
      .get<GoogleMapsPublicConfig>("/settings/google-maps/public")
      .then((res) => {
        const key = res.data?.mapsApiKey ?? null;
        setMapsApiKey(key);
        if (!key) {
          setMapsConfigError(
            "Google Maps API key is not configured. Autocomplete will work as plain text.",
          );
        } else {
          setMapsConfigError(null);
        }
      })
      .catch(() => {
        setMapsApiKey(null);
        setMapsConfigError("Failed to load Google Maps configuration.");
      });
  }, [open]);

  useEffect(
    () => () => {
      if (startBlurTimeoutRef.current) clearTimeout(startBlurTimeoutRef.current);
      if (endBlurTimeoutRef.current) clearTimeout(endBlurTimeoutRef.current);
    },
    [],
  );

  const geocodeStartFromText = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!mapsApiKey || q.length < 3) return;
      if (lastStartGeocodedRef.current === q) return;
      lastStartGeocodedRef.current = q;
      setStartError(null);
      setStartGeocodeLoading(true);
      try {
        const result = await geocodeText(mapsApiKey, q, { regionCode: "UA" });
        if (!result) {
          setStartError("Address service temporarily unavailable.");
          return;
        }
        const merged = mergeFormattedAddressWithUserDetail(q, result.formattedAddress || q);
        setRouteStartLabel(merged);
        setRouteStartLat(String(result.lat));
        setRouteStartLng(String(result.lng));
        lastStartGeocodedRef.current = merged.trim();
      } catch {
        setStartError("Address service temporarily unavailable.");
      } finally {
        setStartGeocodeLoading(false);
      }
    },
    [mapsApiKey],
  );

  const geocodeEndFromText = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!mapsApiKey || q.length < 3) return;
      if (lastEndGeocodedRef.current === q) return;
      lastEndGeocodedRef.current = q;
      setEndError(null);
      setEndGeocodeLoading(true);
      try {
        const result = await geocodeText(mapsApiKey, q, { regionCode: "UA" });
        if (!result) {
          setEndError("Address service temporarily unavailable.");
          return;
        }
        const merged = mergeFormattedAddressWithUserDetail(q, result.formattedAddress || q);
        setRouteEndLabel(merged);
        setRouteEndLat(String(result.lat));
        setRouteEndLng(String(result.lng));
        lastEndGeocodedRef.current = merged.trim();
      } catch {
        setEndError("Address service temporarily unavailable.");
      } finally {
        setEndGeocodeLoading(false);
      }
    },
    [mapsApiKey],
  );

  const handleSelectStartSuggestion = useCallback(
    async (suggestion: PlaceSuggestion) => {
      if (!mapsApiKey) return;
      const userTypedBeforeSelect = routeStartLabel.trim();
      setRouteStartLabel(suggestion.description);
      setStartSuggestions([]);
      setStartSuggestionsOpen(false);
      setStartError(null);
      setStartGeocodeLoading(true);
      try {
        const result = await geocodePlace(mapsApiKey, suggestion.placeId);
        if (!result) {
          setStartError("Address service temporarily unavailable.");
          return;
        }
        const merged = mergeFormattedAddressWithUserDetail(
          userTypedBeforeSelect,
          result.formattedAddress || suggestion.description,
        );
        setRouteStartLabel(merged);
        setRouteStartLat(String(result.lat));
        setRouteStartLng(String(result.lng));
        lastStartGeocodedRef.current = merged.trim();
      } catch {
        setStartError("Address service temporarily unavailable.");
      } finally {
        setStartGeocodeLoading(false);
      }
    },
    [mapsApiKey, routeStartLabel],
  );

  const handleSelectEndSuggestion = useCallback(
    async (suggestion: PlaceSuggestion) => {
      if (!mapsApiKey) return;
      const userTypedBeforeSelect = routeEndLabel.trim();
      setRouteEndLabel(suggestion.description);
      setEndSuggestions([]);
      setEndSuggestionsOpen(false);
      setEndError(null);
      setEndGeocodeLoading(true);
      try {
        const result = await geocodePlace(mapsApiKey, suggestion.placeId);
        if (!result) {
          setEndError("Address service temporarily unavailable.");
          return;
        }
        const merged = mergeFormattedAddressWithUserDetail(
          userTypedBeforeSelect,
          result.formattedAddress || suggestion.description,
        );
        setRouteEndLabel(merged);
        setRouteEndLat(String(result.lat));
        setRouteEndLng(String(result.lng));
        lastEndGeocodedRef.current = merged.trim();
      } catch {
        setEndError("Address service temporarily unavailable.");
      } finally {
        setEndGeocodeLoading(false);
      }
    },
    [mapsApiKey, routeEndLabel],
  );

  useEffect(() => {
    if (!open || !startSuggestionsOpen || !mapsApiKey) {
      setStartSuggestions([]);
      return;
    }
    const query = routeStartLabel.trim();
    if (query.length < 3) {
      setStartSuggestions([]);
      return;
    }
    setStartLookupLoading(true);
    const controller = new AbortController();
    startAutocompleteAbortRef.current = controller;
    const timer = setTimeout(async () => {
      try {
        const suggestions = await autocompleteAddress(mapsApiKey, query, { limit: 6, regionCode: "UA" });
        if (startAutocompleteAbortRef.current !== controller) return;
        setStartSuggestions(suggestions);
        setStartError(null);
      } catch {
        if (startAutocompleteAbortRef.current !== controller) return;
        setStartSuggestions([]);
        setStartError("Address service temporarily unavailable.");
      } finally {
        if (startAutocompleteAbortRef.current === controller) setStartLookupLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
      startAutocompleteAbortRef.current = null;
    };
  }, [mapsApiKey, open, routeStartLabel, startSuggestionsOpen]);

  useEffect(() => {
    if (!open || !endSuggestionsOpen || !mapsApiKey) {
      setEndSuggestions([]);
      return;
    }
    const query = routeEndLabel.trim();
    if (query.length < 3) {
      setEndSuggestions([]);
      return;
    }
    setEndLookupLoading(true);
    const controller = new AbortController();
    endAutocompleteAbortRef.current = controller;
    const timer = setTimeout(async () => {
      try {
        const suggestions = await autocompleteAddress(mapsApiKey, query, { limit: 6, regionCode: "UA" });
        if (endAutocompleteAbortRef.current !== controller) return;
        setEndSuggestions(suggestions);
        setEndError(null);
      } catch {
        if (endAutocompleteAbortRef.current !== controller) return;
        setEndSuggestions([]);
        setEndError("Address service temporarily unavailable.");
      } finally {
        if (endAutocompleteAbortRef.current === controller) setEndLookupLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
      endAutocompleteAbortRef.current = null;
    };
  }, [endSuggestionsOpen, mapsApiKey, open, routeEndLabel]);

  const validate = () => {
    const c = (label: string, s: string) => {
      const t = s.trim();
      if (t === "") return null;
      const n = Number(t.replace(",", "."));
      return Number.isFinite(n) ? null : `${label}: invalid number`;
    };
    const e1 = c("Start lat", routeStartLat);
    if (e1) return e1;
    const e2 = c("Start lng", routeStartLng);
    if (e2) return e2;
    const e3 = c("End lat", routeEndLat);
    if (e3) return e3;
    const e4 = c("End lng", routeEndLng);
    if (e4) return e4;
    if (
      (routeStartLat.trim() !== "") !== (routeStartLng.trim() !== "") ||
      (routeEndLat.trim() !== "") !== (routeEndLng.trim() !== "")
    ) {
      return "Заполните обе координаты для точки или оставьте обе пустыми";
    }

    if (mode === "create") {
      if (email.trim().length === 0) return "Email is required";
      if (!email.includes("@")) return "Invalid email";
      if (password.trim().length < 6) return "Password must be at least 6 characters";
    }
    if (mode === "edit") {
      if (password.trim().length > 0 && password.trim().length < 6) {
        return "Password must be at least 6 characters";
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

        // 1) fullName/password (password only if provided)
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

        await apiHttp.patch(`/users/${initial.id}`, {
          ...payload,
          routeStartLat: parseCoord(routeStartLat),
          routeStartLng: parseCoord(routeStartLng),
          routeEndLat: parseCoord(routeEndLat),
          routeEndLng: parseCoord(routeEndLng),
          routeStartLabel: routeStartLabel.trim() || null,
          routeEndLabel: routeEndLabel.trim() || null,
          leadId: leadId || null,
        });

        // 2) role via dedicated endpoint
        await apiHttp.patch(`/users/${initial.id}/role`, { role });
      }

      onSaved();
      onClose();
    } catch (e) {
      setError(pickMessage(e, "Failed"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!initial?.id) return;
    if (!confirm(`Delete employee ${initial.email}?`)) return;

    setSaving(true);
    setError(null);

    try {
      await apiHttp.delete(`/users/${initial.id}`);
      onSaved();
      onClose();
    } catch (e) {
      setError(pickMessage(e, "Failed"));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm"
      role="presentation"
      onClick={() => !saving && onClose()}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div className="text-base font-semibold text-zinc-900">{title}</div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-zinc-200 px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4">
          {error && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <label className="block text-sm font-medium text-zinc-700">
            Email {mode === "edit" ? "(логін)" : ""}
          </label>
          <input
            type="text"
            className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 disabled:bg-zinc-100"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={false}
            placeholder="user@company.com"
            autoComplete="off"
          />

          <label className="mt-3 block text-sm font-medium text-zinc-700">Full name</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={saving}
            placeholder="John Doe"
            autoComplete="name"
          />

          <label className="mt-3 block text-sm font-medium text-zinc-700">
            {mode === "create" ? "Password" : "New password (optional)"}
          </label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={saving}
            placeholder={mode === "create" ? "••••••" : "leave empty to keep current"}
            type="password"
            autoComplete="new-password"
          />

          <label className="mt-3 block text-sm font-medium text-zinc-700">Role</label>
          <select
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={role}
            onChange={(e) => setRole(e.target.value as Employee["role"])}
            disabled={saving}
            aria-label="Role"
          >
            <option value="USER">USER</option>
            <option value="LEAD">LEAD</option>
            <option value="MANAGER">MANAGER</option>
            <option value="ADMIN">ADMIN</option>
          </select>

          {mode === "edit" && initial?.id ? (
            <>
              <div className="mt-4 border-t border-zinc-200 pt-3">
                <div className="text-sm font-semibold text-zinc-900">Маршрут визитов</div>
                <p className="mt-1 text-xs text-zinc-500">
                  Начальная и конечная точка для построения маршрута в Google Maps (lat, lng).
                </p>
                <label className="mt-2 block text-xs font-medium text-zinc-700">Старт — подпись</label>
                <div className="mt-0.5">
                  <div className="relative">
                    <input
                      className="w-full rounded-md border border-zinc-200 px-3 py-1.5 text-sm"
                      value={routeStartLabel}
                      onChange={(e) => {
                        setRouteStartLabel(e.target.value);
                        lastStartGeocodedRef.current = "";
                        setStartError(null);
                      }}
                      onFocus={() => setStartSuggestionsOpen(true)}
                      onBlur={() => {
                        startBlurTimeoutRef.current = setTimeout(() => {
                          setStartSuggestionsOpen(false);
                        }, 120);
                        if (routeStartLabel.trim().length >= 3 && mapsApiKey) {
                          void geocodeStartFromText(routeStartLabel);
                        }
                      }}
                      placeholder="Офис, дом… (начните вводить адрес)"
                    />
                    {startSuggestionsOpen && startSuggestions.length > 0 ? (
                      <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-zinc-200 bg-white shadow-lg">
                        {startSuggestions.map((s) => (
                          <button
                            key={s.placeId}
                            type="button"
                            className="block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              void handleSelectStartSuggestion(s);
                            }}
                          >
                            {s.description}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500">
                    {startLookupLoading && mapsApiKey ? "Searching addresses…" : null}
                    {!startLookupLoading && startGeocodeLoading ? "Searching coordinates…" : null}
                    {!startLookupLoading && !startGeocodeLoading && startError ? startError : null}
                    {!startLookupLoading && !startGeocodeLoading && !startError && !mapsApiKey
                      ? mapsConfigError
                      : null}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-zinc-600">Старт lat</label>
                    <input
                      className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                      value={routeStartLat}
                      onChange={(e) => setRouteStartLat(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-600">Старт lng</label>
                    <input
                      className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                      value={routeStartLng}
                      onChange={(e) => setRouteStartLng(e.target.value)}
                    />
                  </div>
                </div>
                <label className="mt-2 block text-xs font-medium text-zinc-700">Финиш — подпись</label>
                <div className="mt-0.5">
                  <div className="relative">
                    <input
                      className="w-full rounded-md border border-zinc-200 px-3 py-1.5 text-sm"
                      value={routeEndLabel}
                      onChange={(e) => {
                        setRouteEndLabel(e.target.value);
                        lastEndGeocodedRef.current = "";
                        setEndError(null);
                      }}
                      onFocus={() => setEndSuggestionsOpen(true)}
                      onBlur={() => {
                        endBlurTimeoutRef.current = setTimeout(() => {
                          setEndSuggestionsOpen(false);
                        }, 120);
                        if (routeEndLabel.trim().length >= 3 && mapsApiKey) {
                          void geocodeEndFromText(routeEndLabel);
                        }
                      }}
                      placeholder="Пусто = как старт (или введите адрес)"
                    />
                    {endSuggestionsOpen && endSuggestions.length > 0 ? (
                      <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-zinc-200 bg-white shadow-lg">
                        {endSuggestions.map((s) => (
                          <button
                            key={s.placeId}
                            type="button"
                            className="block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              void handleSelectEndSuggestion(s);
                            }}
                          >
                            {s.description}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500">
                    {endLookupLoading && mapsApiKey ? "Searching addresses…" : null}
                    {!endLookupLoading && endGeocodeLoading ? "Searching coordinates…" : null}
                    {!endLookupLoading && !endGeocodeLoading && endError ? endError : null}
                    {!endLookupLoading && !endGeocodeLoading && !endError && !mapsApiKey
                      ? mapsConfigError
                      : null}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-zinc-600">Финиш lat</label>
                    <input
                      className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                      value={routeEndLat}
                      onChange={(e) => setRouteEndLat(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-600">Финиш lng</label>
                    <input
                      className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                      value={routeEndLng}
                      onChange={(e) => setRouteEndLng(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <label className="mt-3 block text-sm font-medium text-zinc-700">Руководитель (для отчётов)</label>
              <select
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
                disabled={saving}
              >
                <option value="">— не выбран —</option>
                {allEmployees
                  .filter((u) => u.id !== initial.id && (u.role === "LEAD" || u.role === "ADMIN"))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName || u.email}
                    </option>
                  ))}
              </select>
              <p className="mt-1 text-xs text-zinc-500">
                Зміна тут оновлює org-chart (слот m1-* / m2-* під lead1/lead2). Збереження структури на
                вкладці «Структура» також перезаписує це поле.
              </p>
            </>
          ) : null}

          <div className="mt-5 flex items-center justify-between">
            <div>
              {canDelete ? (
                <button
                  type="button"
                  onClick={() => void remove()}
                  disabled={saving}
                  className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Delete
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
                Cancel
              </button>

              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="btn-primary"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
