"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { strings } from "@/locales";
import {
  planningApi,
  type BomCatalogItem,
  type BomCatalogLine,
} from "@/lib/api/resources/planning";
import { productsApi, type ProductCatalogItem } from "@/lib/api/resources/products";

type DraftLine = {
  componentProductId: string;
  sku: string;
  name: string;
  qtyPerKit: string;
  scrapPct: string;
};

type EditorMode = "edit" | "new" | "copy";

type EditorState = {
  mode: EditorMode;
  kitProductId: string;
  sku: string;
  name: string;
  lines: DraftLine[];
  sourceKitProductId?: string;
  /** For mode=new: create a product vs pick an existing kit without BOM. */
  newKitMode?: "create" | "existing";
};

function toDraftLines(lines: BomCatalogLine[]): DraftLine[] {
  return lines.map((line) => ({
    componentProductId: line.componentProductId,
    sku: line.sku,
    name: line.name,
    qtyPerKit: String(line.qtyPerKit),
    scrapPct: line.scrapPct != null ? String(line.scrapPct) : "",
  }));
}

function KitPicker({
  label,
  valueId,
  valueLabel,
  onlyWithoutBom,
  excludeId,
  catalog,
  onPick,
}: {
  label: string;
  valueId: string;
  valueLabel: string;
  onlyWithoutBom?: boolean;
  excludeId?: string;
  catalog: BomCatalogItem[];
  onPick: (kit: BomCatalogItem) => void;
}) {
  const t = strings.planning.kitSpecs;
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return catalog
      .filter((kit) => {
        if (excludeId && kit.kitProductId === excludeId) return false;
        if (onlyWithoutBom && kit.bomId) return false;
        if (!needle) return true;
        return (
          kit.sku.toLowerCase().includes(needle) ||
          kit.name.toLowerCase().includes(needle)
        );
      })
      .slice(0, 12);
  }, [catalog, excludeId, onlyWithoutBom, q]);

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-zinc-800">{label}</label>
      {valueId ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
          <span className="font-medium text-zinc-900">{valueLabel}</span>
          <button
            type="button"
            className="text-xs text-cyan-700 underline"
            onClick={() =>
              onPick({
                kitProductId: "",
                sku: "",
                name: "",
                bomId: null,
                revision: null,
                linesCount: 0,
                lines: [],
              })
            }
          >
            {t.pickKit}
          </button>
        </div>
      ) : (
        <>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.kitSearch}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
          <ul className="max-h-40 overflow-auto rounded-lg border border-zinc-200 bg-white">
            {hits.length === 0 ? (
              <li className="px-3 py-2 text-sm text-zinc-500">{t.noMatches}</li>
            ) : (
              hits.map((kit) => (
                <li key={kit.kitProductId}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-zinc-50"
                    onClick={() => onPick(kit)}
                  >
                    <span className="font-medium text-zinc-900">{kit.sku}</span>
                    <span className="text-xs text-zinc-500">{kit.name}</span>
                    {!kit.bomId ? (
                      <span className="mt-0.5 text-[11px] text-amber-700">{t.noBom}</span>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </>
      )}
    </div>
  );
}

function SpecEditor({
  state,
  catalog,
  busy,
  error,
  onChange,
  onClose,
  onSave,
}: {
  state: EditorState;
  catalog: BomCatalogItem[];
  busy: boolean;
  error: string | null;
  onChange: (next: EditorState) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const t = strings.planning.kitSpecs;
  const [partQ, setPartQ] = useState("");
  const [partHits, setPartHits] = useState<ProductCatalogItem[]>([]);
  const [addQty, setAddQty] = useState("1");

  useEffect(() => {
    if (partQ.trim().length < 2) {
      setPartHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void productsApi
        .listParts({ search: partQ.trim(), pageSize: 12 })
        .then((res) => setPartHits(res.items ?? []))
        .catch(() => setPartHits([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [partQ]);

  const title =
    state.mode === "copy" ? t.copyTitle : state.mode === "new" ? t.newTitle : t.editTitle;

  const addPart = (part: ProductCatalogItem) => {
    if (state.lines.some((l) => l.componentProductId === part.id)) return;
    const qty = Math.max(0.0001, Number(addQty) || 1);
    onChange({
      ...state,
      lines: [
        ...state.lines,
        {
          componentProductId: part.id,
          sku: part.sku,
          name: part.name,
          qtyPerKit: String(qty),
          scrapPct: "",
        },
      ],
    });
    setPartQ("");
    setPartHits([]);
    setAddQty("1");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">{title}</h3>
            {state.mode === "edit" && state.sku ? (
              <p className="mt-1 text-sm text-zinc-600">
                {state.sku} · {state.name}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700"
            onClick={onClose}
          >
            {t.close}
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {state.mode === "new" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`rounded-lg px-3 py-1.5 text-sm ${
                    (state.newKitMode ?? "create") === "create"
                      ? "bg-cyan-600 text-white"
                      : "border border-zinc-200 text-zinc-700"
                  }`}
                  onClick={() =>
                    onChange({
                      ...state,
                      newKitMode: "create",
                      kitProductId: "",
                    })
                  }
                >
                  {t.createNewKit}
                </button>
                <button
                  type="button"
                  className={`rounded-lg px-3 py-1.5 text-sm ${
                    state.newKitMode === "existing"
                      ? "bg-cyan-600 text-white"
                      : "border border-zinc-200 text-zinc-700"
                  }`}
                  onClick={() =>
                    onChange({
                      ...state,
                      newKitMode: "existing",
                      sku: "",
                      name: "",
                    })
                  }
                >
                  {t.useExistingKit}
                </button>
              </div>

              {(state.newKitMode ?? "create") === "create" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="font-medium text-zinc-800">{t.newKitSku}</span>
                    <input
                      value={state.sku}
                      onChange={(e) => onChange({ ...state, sku: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                      autoFocus
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium text-zinc-800">{t.newKitName}</span>
                    <input
                      value={state.name}
                      onChange={(e) => onChange({ ...state, name: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
              ) : (
                <KitPicker
                  label={t.pickKit}
                  valueId={state.kitProductId}
                  valueLabel={state.sku ? `${state.sku} · ${state.name}` : ""}
                  onlyWithoutBom
                  catalog={catalog}
                  onPick={(kit) =>
                    onChange({
                      ...state,
                      kitProductId: kit.kitProductId,
                      sku: kit.sku,
                      name: kit.name,
                      lines: kit.lines.length ? toDraftLines(kit.lines) : state.lines,
                    })
                  }
                />
              )}
            </div>
          ) : null}

          {state.mode === "copy" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <KitPicker
                label={t.sourceKit}
                valueId={state.sourceKitProductId ?? ""}
                valueLabel={(() => {
                  const src = catalog.find((k) => k.kitProductId === state.sourceKitProductId);
                  return src ? `${src.sku} · ${src.name}` : "";
                })()}
                catalog={catalog.filter((k) => k.bomId)}
                onPick={(kit) =>
                  onChange({
                    ...state,
                    sourceKitProductId: kit.kitProductId || undefined,
                    lines: kit.kitProductId ? toDraftLines(kit.lines) : [],
                  })
                }
              />
              <KitPicker
                label={t.targetKit}
                valueId={state.kitProductId}
                valueLabel={state.sku ? `${state.sku} · ${state.name}` : ""}
                excludeId={state.sourceKitProductId}
                catalog={catalog}
                onPick={(kit) =>
                  onChange({
                    ...state,
                    kitProductId: kit.kitProductId,
                    sku: kit.sku,
                    name: kit.name,
                  })
                }
              />
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-xl border border-zinc-200">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium text-zinc-600">
                  <th className="px-3 py-2">{t.colSku}</th>
                  <th className="px-3 py-2">{t.colName}</th>
                  <th className="px-3 py-2">{t.colQty}</th>
                  <th className="px-3 py-2">{t.colScrap}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {state.lines.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-zinc-500" colSpan={5}>
                      {t.needLines}
                    </td>
                  </tr>
                ) : (
                  state.lines.map((line, idx) => (
                    <tr key={line.componentProductId} className="border-b border-zinc-100">
                      <td className="px-3 py-2 font-medium text-zinc-900">{line.sku}</td>
                      <td className="px-3 py-2 text-zinc-600">{line.name}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0.0001}
                          step="any"
                          className="w-24 rounded border border-zinc-200 px-2 py-1 tabular-nums"
                          value={line.qtyPerKit}
                          onChange={(e) => {
                            const lines = [...state.lines];
                            lines[idx] = { ...line, qtyPerKit: e.target.value };
                            onChange({ ...state, lines });
                          }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          className="w-20 rounded border border-zinc-200 px-2 py-1 tabular-nums"
                          value={line.scrapPct}
                          placeholder="0"
                          onChange={(e) => {
                            const lines = [...state.lines];
                            lines[idx] = { ...line, scrapPct: e.target.value };
                            onChange({ ...state, lines });
                          }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="text-xs text-rose-700 underline"
                          onClick={() =>
                            onChange({
                              ...state,
                              lines: state.lines.filter((_, i) => i !== idx),
                            })
                          }
                        >
                          {t.removeLine}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-dashed border-zinc-300 p-3">
            <p className="mb-2 text-sm font-medium text-zinc-800">{t.addPart}</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={partQ}
                onChange={(e) => setPartQ(e.target.value)}
                placeholder={t.partSearch}
                className="min-w-[12rem] flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
              <input
                type="number"
                min={0.0001}
                step="any"
                value={addQty}
                onChange={(e) => setAddQty(e.target.value)}
                className="w-24 rounded-lg border border-zinc-200 px-2 py-2 text-sm tabular-nums"
                title={t.colQty}
              />
            </div>
            {partHits.length > 0 ? (
              <ul className="mt-2 max-h-36 overflow-auto rounded-lg border border-zinc-200">
                {partHits.map((part) => (
                  <li key={part.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-zinc-50"
                      onClick={() => addPart(part)}
                    >
                      <span className="font-medium text-zinc-900">{part.sku}</span>
                      <span className="text-xs text-zinc-500">{part.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-4">
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700"
            onClick={onClose}
          >
            {t.cancel}
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-60"
            onClick={onSave}
          >
            {busy ? t.saving : t.save}
          </button>
        </div>
      </div>
    </div>
  );
}

export function KitSpecsPanel({ onError }: { onError: (msg: string) => void }) {
  const t = strings.planning.kitSpecs;
  const [items, setItems] = useState<BomCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [busy, setBusy] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await planningApi.listBomCatalog());
    } catch (e) {
      onError(e instanceof Error ? e.message : t.loadError);
    } finally {
      setLoading(false);
    }
  }, [onError, t.loadError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((kit) => {
      if (kit.sku.toLowerCase().includes(q) || kit.name.toLowerCase().includes(q)) return true;
      return kit.lines.some(
        (line) =>
          line.sku.toLowerCase().includes(q) || line.name.toLowerCase().includes(q),
      );
    });
  }, [items, query]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openEdit = (kit: BomCatalogItem) => {
    setEditorError(null);
    setEditor({
      mode: "edit",
      kitProductId: kit.kitProductId,
      sku: kit.sku,
      name: kit.name,
      lines: toDraftLines(kit.lines),
    });
  };

  const openNew = () => {
    setEditorError(null);
    setEditor({
      mode: "new",
      kitProductId: "",
      sku: "",
      name: "",
      lines: [],
      newKitMode: "create",
    });
  };

  const openCopy = (source?: BomCatalogItem) => {
    setEditorError(null);
    setEditor({
      mode: "copy",
      kitProductId: "",
      sku: "",
      name: "",
      sourceKitProductId: source?.kitProductId,
      lines: source ? toDraftLines(source.lines) : [],
    });
  };

  const saveEditor = async () => {
    if (!editor) return;
    const creatingNewKit =
      editor.mode === "new" && (editor.newKitMode ?? "create") === "create";
    if (creatingNewKit) {
      if (!editor.sku.trim()) {
        setEditorError(t.newKitSkuRequired);
        return;
      }
      if (!editor.name.trim()) {
        setEditorError(t.newKitNameRequired);
        return;
      }
    } else if (!editor.kitProductId) {
      setEditorError(t.pickKit);
      return;
    }
    if (editor.mode === "copy" && !editor.sourceKitProductId) {
      setEditorError(t.sourceKit);
      return;
    }
    const lines = editor.lines
      .map((line, idx) => ({
        componentProductId: line.componentProductId,
        qtyPerKit: Number(line.qtyPerKit),
        scrapPct: line.scrapPct.trim() === "" ? undefined : Number(line.scrapPct),
        sortOrder: idx,
      }))
      .filter((line) => line.componentProductId && line.qtyPerKit > 0);
    if (lines.length === 0) {
      setEditorError(t.needLines);
      return;
    }

    setBusy(true);
    setEditorError(null);
    try {
      let kitProductId = editor.kitProductId;
      let sku = editor.sku;
      if (creatingNewKit) {
        const created = await productsApi.createProduct({
          sku: editor.sku.trim(),
          name: editor.name.trim(),
          showOnStore: false,
        });
        kitProductId = created.id;
        sku = created.sku;
      }
      const saved = await planningApi.createBomRevision(kitProductId, { lines });
      if (editor.mode === "copy" && editor.sourceKitProductId) {
        const from =
          items.find((k) => k.kitProductId === editor.sourceKitProductId)?.sku ??
          editor.sourceKitProductId;
        setToast(t.copied(from, sku || saved.kitProduct?.sku || kitProductId));
      } else {
        setToast(t.saved(sku || saved.kitProduct?.sku || kitProductId, saved.revision));
      }
      setEditor(null);
      await load();
    } catch (e) {
      setEditorError(
        e instanceof Error
          ? e.message
          : editor.mode === "copy"
            ? t.copyError
            : t.saveError,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">{t.hint}</p>
      {toast ? <p className="text-sm text-emerald-800">{toast}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.search}
          className="w-full max-w-sm rounded-lg border border-zinc-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={openNew}
          className="rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700"
        >
          {t.newSpec}
        </button>
        <button
          type="button"
          onClick={() => openCopy()}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
        >
          {t.copySpec}
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium text-zinc-600">
              <th className="px-3 py-2">{t.colSku}</th>
              <th className="px-3 py-2">{t.colName}</th>
              <th className="px-3 py-2">BOM</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-6 text-zinc-500" colSpan={4}>
                  {strings.common.loading}
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-zinc-500" colSpan={4}>
                  {items.length === 0 ? t.empty : t.noMatches}
                </td>
              </tr>
            ) : (
              filtered.map((kit) => {
                const open = expanded.has(kit.kitProductId);
                return (
                  <Fragment key={kit.kitProductId}>
                    <tr className="border-b border-zinc-100 align-top">
                      <td className="px-3 py-2 font-medium text-zinc-900">{kit.sku}</td>
                      <td className="px-3 py-2 text-zinc-700">{kit.name}</td>
                      <td className="px-3 py-2 text-zinc-600">
                        {kit.bomId && kit.revision != null ? (
                          <span>
                            {t.rev(kit.revision)} · {t.lines(kit.linesCount)}
                          </span>
                        ) : (
                          <span className="text-amber-700">{t.noBom}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          {kit.linesCount > 0 ? (
                            <button
                              type="button"
                              className="text-xs text-zinc-600 underline"
                              onClick={() => toggleExpand(kit.kitProductId)}
                            >
                              {open ? t.collapse : t.expand}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="text-xs text-cyan-700 underline"
                            onClick={() => openEdit(kit)}
                          >
                            {kit.bomId ? t.edit : t.newSpec}
                          </button>
                          {kit.bomId ? (
                            <button
                              type="button"
                              className="text-xs text-cyan-700 underline"
                              onClick={() => openCopy(kit)}
                            >
                              {t.copySpec}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {open ? (
                      <tr className="border-b border-zinc-100 bg-zinc-50/80">
                        <td colSpan={4} className="px-3 py-2">
                          <ul className="space-y-1 text-xs text-zinc-700">
                            {kit.lines.map((line) => (
                              <li key={line.componentProductId}>
                                <span className="font-medium">{line.sku}</span>
                                <span className="text-zinc-500"> · {line.name}</span>
                                <span className="ml-2 tabular-nums text-zinc-800">
                                  ×{line.qtyPerKit}
                                  {line.scrapPct != null && line.scrapPct > 0
                                    ? ` (+${line.scrapPct}% scrap)`
                                    : ""}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {editor ? (
        <SpecEditor
          state={editor}
          catalog={items}
          busy={busy}
          error={editorError}
          onChange={setEditor}
          onClose={() => {
            if (!busy) setEditor(null);
          }}
          onSave={() => void saveEditor()}
        />
      ) : null}
    </div>
  );
}
