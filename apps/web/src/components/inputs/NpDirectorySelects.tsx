"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { apiHttp } from "@/lib/api/client";
import { strings } from "@/locales";
import {
  FixedDropdownPortal,
  useDismissOnOutsidePointerDown,
} from "@/components/overlays/FixedDropdownPortal";

function NpSelectDropdown({
  open,
  anchorRef,
  panelRef,
  children,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLDivElement | null>;
  panelRef?: RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <FixedDropdownPortal open={open} anchorRef={anchorRef} panelRef={panelRef} maxHeight="12rem">
      {children}
    </FixedDropdownPortal>
  );
}

function npSelect() {
  return strings.np.directorySelect;
}

type NpCityItem = {
  ref: string;
  description: string;
  settlementTypeDescription?: string | null;
  areaDescription?: string | null;
  region?: string | null;
};

/**
 * Підпис без дублікатів: Description вже може містити "(область)" або район —
 * додаємо areaDescription/region тільки якщо їх ще немає в тексті.
 */
function cityDisplayLabel(c: NpCityItem): string {
  const d = (c.description ?? "").trim();
  const lower = d.toLowerCase();
  const parts: string[] = [d];
  const ad = (c.areaDescription ?? "").trim();
  if (ad && !lower.includes(ad.toLowerCase())) parts.push(ad);
  const reg = (c.region ?? "").trim();
  const regNorm = reg.replace(/\s*область\s*$/i, "").replace(/\s*обл\.?\s*$/i, "").trim();
  if (reg && !lower.includes(regNorm.toLowerCase())) parts.push(reg);
  return parts.join(", ");
}

/** Extract city name only: no region, no parenthetical (місто/город/...). */
function cityNameOnly(fullLabel: string): string {
  let s = fullLabel.trim();
  s = s.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const comma = s.indexOf(",");
  if (comma > 0) return s.slice(0, comma).trim();
  const ob = s.search(/\s+[А-Яа-яІіЇїЄєҐґ]+\s*область$/i);
  if (ob > 0) return s.slice(0, ob).trim();
  return s;
}

/** Is this a city (місто/город) — prioritize over oblast, district, village. */
function isCitySettlement(item: NpCityItem): boolean {
  const st = (item.settlementTypeDescription ?? "").toLowerCase();
  const desc = (item.description ?? "").toLowerCase();
  return (
    st.includes("місто") ||
    st.includes("город") ||
    st === "м." ||
    /^[^,—]+[,—]\s*м\./i.test(item.description ?? "") ||
    desc.includes(" — м.") ||
    desc.includes(", м.") ||
    desc.startsWith("м. ")
  );
}

/** Is this oblast/region — deprioritize vs actual city. */
function isOblastOrRegion(item: NpCityItem): boolean {
  const st = (item.settlementTypeDescription ?? "").toLowerCase();
  const ad = (item.areaDescription ?? "").toLowerCase();
  const desc = (item.description ?? "").toLowerCase();
  return (
    st.includes("область") ||
    ad.includes("область") ||
    /область\s*$/i.test(desc) ||
    /район\s*$/i.test(desc)
  );
}

/** City search query variants (Ukrainian ↔ Russian) so e.g. "Дніпро" finds "Днепр". */
function cityQueryVariants(q: string): string[] {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  const variants = new Set<string>([t]);
  const ukToRu = t.replace(/і/g, "е").replace(/ї/g, "и").replace(/є/g, "е");
  if (ukToRu !== t) {
    variants.add(ukToRu);
    if (ukToRu.length > 1 && ukToRu.endsWith("о")) variants.add(ukToRu.slice(0, -1));
  }
  const ruToUk = t.replace(/е/g, "і").replace(/и/g, "ї");
  if (ruToUk !== t) variants.add(ruToUk);
  return Array.from(variants);
}

type NpWarehouseItem = {
  ref: string;
  description: string;
  shortAddress?: string | null;
  number?: string | null;
  isPostomat?: boolean;
};

export function NpCitySelect({
  valueRef,
  valueLabel,
  onChange,
  disabled,
  placeholder,
}: {
  valueRef: string;
  valueLabel: string;
  onChange: (ref: string, label: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const t = npSelect();
  const inputPlaceholder = placeholder ?? t.cityPlaceholder;
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const lastQueryRef = useRef<string>("");

  useEffect(() => {
    if (q.trim().length < 2) {
      setOptions([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const qAtRequest = q.trim();
      lastQueryRef.current = qAtRequest;
      setLoading(true);
      const variants = cityQueryVariants(qAtRequest);
      Promise.all(
        variants.map((v) =>
          apiHttp.get<{ status: string; items?: NpCityItem[] }>(
            `/np/cities?q=${encodeURIComponent(v)}&limit=50`,
          ),
        ),
      )
        .then((responses) => {
          if (lastQueryRef.current !== qAtRequest) return;
          const byRef = new Map<
            string,
            { id: string; label: string; raw: NpCityItem }
          >();
          for (const res of responses) {
            const items = (res.data?.items ?? []) as NpCityItem[];
            for (const c of items) {
              if (!byRef.has(c.ref)) {
                const full = cityDisplayLabel(c);
                byRef.set(c.ref, {
                  id: c.ref,
                  label: full,
                  raw: c,
                });
              }
            }
          }
          const list = Array.from(byRef.values());
          const allVariants = cityQueryVariants(qAtRequest);
          const firstLetters = new Set<string>();
          for (const v of allVariants) {
            if (v.length > 0) firstLetters.add(v[0]);
          }
          const textScore = (label: string) => {
            const L = label.toLowerCase().trim();
            for (const v of allVariants) {
              if (L === v) return 4;
            }
            const first = L[0];
            if (first && firstLetters.has(first)) {
              for (const v of allVariants) {
                if (L.startsWith(v)) return 3;
                if (L.includes(v)) return 2;
              }
              return 1;
            }
            for (const v of allVariants) {
              if (L.startsWith(v)) return 2;
              if (L.includes(v)) return 1;
            }
            return 0;
          };
          list.sort((a, b) => {
            const cityA = isCitySettlement(a.raw) ? 1 : 0;
            const cityB = isCitySettlement(b.raw) ? 1 : 0;
            if (cityA !== cityB) return cityB - cityA;
            const oblastA = isOblastOrRegion(a.raw) ? 1 : 0;
            const oblastB = isOblastOrRegion(b.raw) ? 1 : 0;
            if (oblastA !== oblastB) return oblastA - oblastB;
            const sa = textScore(a.label);
            const sb = textScore(b.label);
            if (sa !== sb) return sb - sa;
            return a.label.localeCompare(b.label, "uk");
          });
          setOptions(list.slice(0, 30).map((x) => ({ id: x.id, label: x.label })));
        })
        .catch(() => {
          if (lastQueryRef.current === qAtRequest) setOptions([]);
        })
        .finally(() => {
          if (lastQueryRef.current === qAtRequest) setLoading(false);
        });
      debounceRef.current = null;
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  const displayValue = open ? q : valueLabel || valueRef || "";
  return (
    <div ref={anchorRef} className="relative">
      <input
        type="text"
        value={displayValue}
        onChange={(e) => {
          setQ(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={inputPlaceholder}
        disabled={disabled}
        className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
      />
      <NpSelectDropdown open={open} anchorRef={anchorRef}>
        {loading && <div className="px-3 py-2 text-sm text-zinc-500">{t.loading}</div>}
        {!loading && options.length === 0 && q.trim().length >= 2 && (
          <div className="px-3 py-2 text-sm text-zinc-500">{t.noResults}</div>
        )}
        {!loading &&
          options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
              onMouseDown={() => {
                onChange(opt.id, opt.label);
                setQ("");
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
      </NpSelectDropdown>
    </div>
  );
}

export function NpWarehouseSelect({
  cityRef,
  type,
  valueRef,
  valueLabel,
  onChange,
  disabled,
  placeholder,
}: {
  cityRef: string;
  type: "WAREHOUSE" | "POSTOMAT";
  valueRef: string;
  valueLabel: string;
  onChange: (ref: string, label: string, number?: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const t = npSelect();
  const inputPlaceholder = placeholder ?? t.warehousePlaceholder;
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<{ id: string; label: string; number?: string | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!cityRef) {
      setOptions([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      setOptions([]);
      apiHttp
        .get<{ status: string; items?: NpWarehouseItem[] }>(
          `/np/warehouses?cityRef=${encodeURIComponent(cityRef)}&q=${encodeURIComponent(q.trim())}&type=${type}&limit=50`,
        )
        .then((res) => {
          const items = res.data?.items ?? [];
          setOptions(
            items.map((w) => ({
              id: w.ref,
              label: [w.number, w.description].filter(Boolean).join(" — ") || w.description,
              number: w.number ?? null,
            })),
          );
        })
        .catch(() => setOptions([]))
        .finally(() => setLoading(false));
      debounceRef.current = null;
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [cityRef, type, q]);

  const displayValue = open
    ? (q.trim() ? q : valueLabel || valueRef || "")
    : valueLabel || valueRef || "";
  return (
    <div ref={anchorRef} className="relative">
      <input
        type="text"
        value={displayValue}
        onChange={(e) => {
          setQ(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => cityRef && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={!cityRef ? t.selectCityFirst : inputPlaceholder}
        disabled={disabled || !cityRef}
        className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
      />
      <NpSelectDropdown open={open && !!cityRef} anchorRef={anchorRef}>
        {loading && <div className="px-3 py-2 text-sm text-zinc-500">{t.loading}</div>}
        {!loading && options.length === 0 && (
          <div className="px-3 py-2 text-sm text-zinc-500">{t.noResults}</div>
        )}
        {!loading &&
          options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
              onMouseDown={() => {
                onChange(opt.id, opt.label, opt.number);
                setQ("");
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
      </NpSelectDropdown>
    </div>
  );
}

type NpSenderCounterpartyItem = {
  ref: string;
  label: string;
};

type NpSenderContactItem = {
  ref: string;
  label: string;
};

export function NpSenderCounterpartySelect({
  valueRef,
  valueLabel,
  onChange,
  disabled,
  placeholder,
}: {
  valueRef: string;
  valueLabel: string;
  onChange: (ref: string, label: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const t = npSelect();
  const inputPlaceholder = placeholder ?? t.senderCounterpartyPlaceholder;
  const [options, setOptions] = useState<NpSenderCounterpartyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || options.length > 0) return;
    setLoading(true);
    setError(null);
    apiHttp
      .get<{ status: string; items?: NpSenderCounterpartyItem[] }>("/np/sender-counterparties")
      .then((res) => {
        setOptions(res.data?.items ?? []);
      })
      .catch(() => {
        setOptions([]);
        setError(t.senderCounterpartiesError);
      })
      .finally(() => setLoading(false));
  }, [open, options.length, t.senderCounterpartiesError]);

  const displayValue = valueLabel || valueRef || "";

  useDismissOnOutsidePointerDown(open, () => setOpen(false), anchorRef, panelRef);

  return (
    <div ref={anchorRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="mt-1 flex w-full items-center justify-between rounded-md border border-zinc-300 bg-white px-3 py-2 text-left text-sm focus:border-zinc-500 focus:outline-none disabled:opacity-50"
      >
        <span className={displayValue ? "text-zinc-900" : "text-zinc-400"}>
          {displayValue || inputPlaceholder}
        </span>
        <span className="text-zinc-400">▾</span>
      </button>
      <NpSelectDropdown open={open} anchorRef={anchorRef} panelRef={panelRef}>
        {loading && <div className="px-3 py-2 text-sm text-zinc-500">{t.loading}</div>}
        {error && !loading ? (
          <div className="px-3 py-2 text-sm text-red-600">{error}</div>
        ) : null}
        {!loading &&
          options.map((opt) => (
            <button
              key={opt.ref}
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
              onMouseDown={() => {
                onChange(opt.ref, opt.label);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        {!loading && !error && options.length === 0 ? (
          <div className="px-3 py-2 text-sm text-zinc-500">{t.noSenderCounterparties}</div>
        ) : null}
      </NpSelectDropdown>
      {valueRef ? (
        <p className="mt-1 font-mono text-[10px] text-zinc-400" title={valueRef}>
          {valueRef.slice(0, 12)}…
        </p>
      ) : null}
    </div>
  );
}

export function NpSenderContactSelect({
  counterpartyRef,
  valueRef,
  valueLabel,
  onChange,
  disabled,
  placeholder,
}: {
  counterpartyRef: string;
  valueRef: string;
  valueLabel: string;
  onChange: (ref: string, label: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const t = npSelect();
  const inputPlaceholder = placeholder ?? t.senderContactPlaceholder;
  const [options, setOptions] = useState<NpSenderContactItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setOptions([]);
  }, [counterpartyRef]);

  useEffect(() => {
    if (!counterpartyRef) {
      return;
    }
    if (!open) return;
    setLoading(true);
    setError(null);
    apiHttp
      .get<{ status: string; items?: NpSenderContactItem[] }>(
        `/np/sender-contacts?counterpartyRef=${encodeURIComponent(counterpartyRef)}`,
      )
      .then((res) => {
        setOptions(res.data?.items ?? []);
      })
      .catch(() => {
        setOptions([]);
        setError(t.senderContactsError);
      })
      .finally(() => setLoading(false));
  }, [counterpartyRef, open, t.senderContactsError]);

  const displayValue = valueLabel || valueRef || "";

  useDismissOnOutsidePointerDown(open, () => setOpen(false), anchorRef, panelRef);

  return (
    <div ref={anchorRef} className="relative">
      <button
        type="button"
        disabled={disabled || !counterpartyRef}
        onClick={() => setOpen((v) => !v)}
        className="mt-1 flex w-full items-center justify-between rounded-md border border-zinc-300 bg-white px-3 py-2 text-left text-sm focus:border-zinc-500 focus:outline-none disabled:opacity-50"
      >
        <span className={displayValue ? "text-zinc-900" : "text-zinc-400"}>
          {!counterpartyRef
            ? t.selectCounterpartyFirst
            : displayValue || inputPlaceholder}
        </span>
        <span className="text-zinc-400">▾</span>
      </button>
      <NpSelectDropdown open={open && !!counterpartyRef} anchorRef={anchorRef} panelRef={panelRef}>
        {loading && <div className="px-3 py-2 text-sm text-zinc-500">{t.loading}</div>}
        {error && !loading ? (
          <div className="px-3 py-2 text-sm text-red-600">{error}</div>
        ) : null}
        {!loading &&
          options.map((opt) => (
            <button
              key={opt.ref}
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
              onMouseDown={() => {
                onChange(opt.ref, opt.label);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        {!loading && !error && options.length === 0 ? (
          <div className="px-3 py-2 text-sm text-zinc-500">{t.noSenderContacts}</div>
        ) : null}
      </NpSelectDropdown>
      {valueRef ? (
        <p className="mt-1 font-mono text-[10px] text-zinc-400" title={valueRef}>
          {valueRef.slice(0, 12)}…
        </p>
      ) : null}
    </div>
  );
}

export function NpStreetSelect({
  cityRef,
  valueRef,
  valueLabel,
  onChange,
  disabled,
  placeholder,
}: {
  cityRef: string;
  valueRef: string;
  valueLabel: string;
  onChange: (ref: string, label: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const t = npSelect();
  const inputPlaceholder = placeholder ?? t.streetPlaceholder;
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  const fetchStreets = (query: string, browse = false) => {
    setLoading(true);
    setOptions([]);
    setEmptyMessage(null);
    let url = `/np/streets?cityRef=${encodeURIComponent(cityRef)}&limit=20`;
    if (browse) {
      url += "&browse=1";
    } else {
      url += `&q=${encodeURIComponent(query)}`;
    }
    
    apiHttp
      .get<{ status: string; items?: { ref: string; street: string }[]; message?: string }>(url)
      .then((res) => {
        const items = res.data?.items ?? [];
        setOptions(items.map((s) => ({ id: s.ref, label: s.street })));
        setEmptyMessage(items.length === 0 && res.data?.message ? res.data.message : null);
        
        if (res.data?.status === "SYNCING") {
          setSyncing(true);
          setTimeout(() => fetchStreets(query, browse), 2500);
        } else {
          setSyncing(false);
        }
      })
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!cityRef || q.trim().length < 3) {
      setOptions([]);
      setSyncing(false);
      setEmptyMessage(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchStreets(q.trim());
      debounceRef.current = null;
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [cityRef, q]);

  const displayValue = open
    ? (q.trim() ? q : valueLabel || valueRef || "")
    : valueLabel || valueRef || "";
    
  return (
    <div ref={anchorRef} className="relative">
      <input
        type="text"
        value={displayValue}
        onChange={(e) => {
          setQ(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => cityRef && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={!cityRef ? t.selectCityFirst : inputPlaceholder}
        disabled={disabled || !cityRef}
        className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
      />
      
      {syncing && q.trim().length >= 3 && (
        <p className="mt-1 text-xs text-zinc-500">{t.streetsSyncing}</p>
      )}
      
      {emptyMessage && q.trim().length >= 3 && open && (
        <div className="mt-1 space-y-1">
          <p className="text-xs text-zinc-600">{emptyMessage}</p>
          <button
            type="button"
            className="text-xs text-blue-600 hover:underline"
            onMouseDown={(e) => {
              e.preventDefault();
              fetchStreets("", true);
            }}
          >
            {t.browseStreets}
          </button>
        </div>
      )}

      <NpSelectDropdown open={open && !!cityRef && options.length > 0} anchorRef={anchorRef}>
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
            onMouseDown={() => {
              onChange(opt.id, opt.label);
              setQ("");
              setOpen(false);
            }}
          >
            {opt.label}
          </button>
        ))}
      </NpSelectDropdown>
    </div>
  );
}
