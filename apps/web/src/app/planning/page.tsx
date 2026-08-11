"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { strings } from "@/locales";
import { HelpHint } from "@/components/help/HelpHint";
import {
  planningApi,
  resolvePlanningUploadError,
  type ActiveBom,
  type BomImportResult,
  type DemandRules,
  type InventorySnapshot,
  type KitCapacity,
  type LaunchRecommendationsResponse,
  type PlanningAvailability,
  type PlanningDashboard,
  type PlanningSettings,
  type ProductionBatch,
  type SalesFreshness,
  type SnapshotFreshness,
  type StockProjection,
} from "@/lib/api/resources/planning";
import { productsApi, type ProductCatalogItem } from "@/lib/api/resources/products";
import { formatDateTime } from "@/lib/crmDatetime";
import {
  FactoryPanel,
  ForecastPanel,
  PackingPanel,
  PlanningFreshnessBanners,
  MrpConfigPanel,
  PlanningHowToPanel,
  PlanningSettingsPanel,
} from "./PlanningOpsPanels";
import { TodayScreen } from "./PlanningScreens";

type PlanningScreen = "today" | "pack" | "make" | "data";

/** Legacy ?tab= keys → new IA (soft redirect). */
const LEGACY_TAB_MAP: Record<string, PlanningScreen> = {
  dashboard: "today",
  mrp: "today",
  mrpCritical: "today",
  mrpPack: "pack",
  packing: "pack",
  mrpProduction: "make",
  mrpSemi: "make",
  factory: "make",
  inventory: "data",
  snapshots: "data",
  bom: "data",
  forecast: "data",
  settings: "data",
  batches: "data",
  queues: "data",
};

const PLANNING_SCREENS: PlanningScreen[] = ["today", "pack", "make", "data"];

function resolveScreen(tab: string | null): PlanningScreen {
  if (!tab) return "today";
  if (tab in LEGACY_TAB_MAP) return LEGACY_TAB_MAP[tab]!;
  if (PLANNING_SCREENS.includes(tab as PlanningScreen)) return tab as PlanningScreen;
  return "today";
}

const ORDER_STAGE_VALUES = [
  "NEW",
  "AWAITING_PAYMENT",
  "AWAITING_STOCK",
  "CONFIRMED",
  "READY_TO_SHIP",
  "SHIPPED",
  "AWAITING_RECEIPT",
  "RECEIVED",
  "COMPLETED",
  "CANCELED",
  "REFUSED",
  "RETURN_IN_PROGRESS",
  "FULLY_RETURNED",
] as const;

const PRODUCTION_STAGE_VALUES = ["MECH", "DEGREASE", "QC", "PACK", "TRANSFER"] as const;

export default function PlanningPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-zinc-600">{strings.common.loading}</div>
      }
    >
      <PlanningPageInner />
    </Suspense>
  );
}

function PlanningPageInner() {
  const t = strings.planning;
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeScreen = resolveScreen(tabParam);
  const [dataSection, setDataSection] = useState<string>("snapshots");
  const setScreen = useCallback(
    (screen: PlanningScreen) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", screen);
      if (screen !== "pack" && screen !== "make") params.delete("sku");
      router.replace(`/planning?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  useEffect(() => {
    if (tabParam && tabParam in LEGACY_TAB_MAP && LEGACY_TAB_MAP[tabParam] !== tabParam) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", LEGACY_TAB_MAP[tabParam]!);
      router.replace(`/planning?${params.toString()}`, { scroll: false });
    }
  }, [tabParam, router, searchParams]);

  useEffect(() => {
    if (tabParam === "snapshots") setDataSection("snapshots");
    else if (tabParam === "bom") setDataSection("bom");
    else if (tabParam === "forecast") setDataSection("sales");
    else if (tabParam === "settings") setDataSection("settings");
    else if (tabParam === "inventory") setDataSection("inventory");
  }, [tabParam]);
  const [howToOpen, setHowToOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [horizonWeeks, setHorizonWeeks] = useState(1);

  const [rules, setRules] = useState<DemandRules | null>(null);
  const [rulesDraft, setRulesDraft] = useState<DemandRules>({
    hardStages: [],
    softStages: [],
    includeOrderItemsWithoutProductIdAsSoft: true,
  });
  const [snapshots, setSnapshots] = useState<InventorySnapshot[]>([]);
  const [qcQueue, setQcQueue] = useState<ProductionBatch[]>([]);
  const [packingQueue, setPackingQueue] = useState<ProductionBatch[]>([]);
  const [launch, setLaunch] = useState<LaunchRecommendationsResponse | null>(null);
  const [batches, setBatches] = useState<ProductionBatch[]>([]);

  const [productSearch, setProductSearch] = useState("");
  const [kitSearch, setKitSearch] = useState("");
  const [products, setProducts] = useState<ProductCatalogItem[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedKitId, setSelectedKitId] = useState<string>("");
  const handleOpsError = useCallback((msg: string) => setError(msg), []);
  const [availability, setAvailability] = useState<PlanningAvailability | null>(null);
  const [bom, setBom] = useState<ActiveBom | null>(null);
  const [capacity, setCapacity] = useState<KitCapacity | null>(null);

  const [bomImportFile, setBomImportFile] = useState<File | null>(null);
  const [importingBom, setImportingBom] = useState(false);
  const [bomImportResult, setBomImportResult] = useState<BomImportResult | null>(null);
  const [snapshotFile, setSnapshotFile] = useState<File | null>(null);
  const [snapshotNote, setSnapshotNote] = useState("");
  const [uploadingSnapshot, setUploadingSnapshot] = useState(false);
  const [snapshotUploadError, setSnapshotUploadError] = useState<string | null>(null);
  const [bomUploadError, setBomUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<{
    snapshotId: string;
    rowsInFile: number;
    keptRows: number;
    skippedIrrelevant: number;
    relevantSkuCount: number;
    unresolvedSku: string[];
    unresolvedWarehouses: string[];
  } | null>(null);

  const [planningDashboard, setPlanningDashboard] = useState<PlanningDashboard | null>(null);
  const [projection, setProjection] = useState<StockProjection | null>(null);
  const [freshness, setFreshness] = useState<SnapshotFreshness | null>(null);
  const [salesFreshness, setSalesFreshness] = useState<SalesFreshness | null>(null);
  const [mrpStale, setMrpStale] = useState(false);
  const [mrpStaleWarning, setMrpStaleWarning] = useState<string | null>(null);
  const [planningSettings, setPlanningSettings] = useState<PlanningSettings | null>(null);
  const [savingRules, setSavingRules] = useState(false);
  const [runningWeekly, setRunningWeekly] = useState(false);
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [movingBatchId, setMovingBatchId] = useState<string | null>(null);
  const [savingBom, setSavingBom] = useState(false);

  const [batchForm, setBatchForm] = useState({
    code: "",
    productId: "",
    qtyPlanned: "",
    dueAt: "",
  });
  const [moveStageForm, setMoveStageForm] = useState({
    batchId: "",
    toStageCode: "QC",
    qtyInStage: "",
    qtyGoodIncrement: "",
    qtyScrapIncrement: "",
    note: "",
  });
  const [bomLines, setBomLines] = useState<
    Array<{ componentProductId: string; qtyPerKit: string; scrapPct: string; sortOrder: number }>
  >([{ componentProductId: "", qtyPerKit: "1", scrapPct: "", sortOrder: 0 }]);

  const selectedProduct = useMemo(
    () => products.find((item) => item.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );
  const selectedKit = useMemo(
    () => products.find((item) => item.id === selectedKitId) ?? null,
    [products, selectedKitId],
  );

  const kitProducts = useMemo(
    () => products.filter((item) => item.kind !== "PART"),
    [products],
  );
  const partProducts = useMemo(() => {
    const byId = new Map<string, ProductCatalogItem>();
    for (const item of products) {
      if (item.kind === "PART") byId.set(item.id, item);
    }
    // Keep current BOM components visible even if they fall outside the parts page.
    for (const line of bom?.lines ?? []) {
      const c = line.component;
      if (!c || byId.has(c.id)) continue;
      byId.set(c.id, {
        id: c.id,
        sku: c.sku,
        name: c.name,
        unit: "pcs",
        basePrice: 0,
        stock: 0,
        kind: (c.kind as ProductCatalogItem["kind"]) ?? "PART",
        showOnStore: false,
        primaryImageUrl: null,
        primaryImageId: null,
      });
    }
    return Array.from(byId.values());
  }, [products, bom]);

  const productNameById = useMemo(() => {
    const map = new Map<string, ProductCatalogItem>();
    products.forEach((item) => map.set(item.id, item));
    partProducts.forEach((item) => map.set(item.id, item));
    return map;
  }, [products, partProducts]);

  const stageLabel = useCallback(
    (code: string | null | undefined) => {
      if (!code) return t.states.none;
      return t.stages[code as keyof typeof t.stages] ?? code;
    },
    [t],
  );

  const orderStageLabel = useCallback(
    (code: string) => t.orderStages[code as keyof typeof t.orderStages] ?? code,
    [t],
  );

  const loadProducts = useCallback(async (search = "") => {
    setProductsLoading(true);
    try {
      const [kits, parts] = await Promise.all([
        productsApi.listCatalog({ search, pageSize: 100, page: 1 }),
        productsApi.listParts({ search, pageSize: 200, page: 1 }),
      ]);
      const byId = new Map<string, ProductCatalogItem>();
      for (const item of [...kits.items, ...parts.items]) byId.set(item.id, item);
      setProducts(Array.from(byId.values()));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t.errors.loadProducts);
    } finally {
      setProductsLoading(false);
    }
  }, [t.errors.loadProducts]);

  const loadBomDetails = useCallback(async (kitId: string) => {
    const bomSettled = await Promise.allSettled([
      planningApi.getBom(kitId),
      planningApi.getKitCapacity(kitId),
    ]);
    const bomRes = bomSettled[0].status === "fulfilled" ? bomSettled[0].value : null;
    const capacityRes = bomSettled[1].status === "fulfilled" ? bomSettled[1].value : null;
    setBom(bomRes);
    setCapacity(capacityRes);
    if (bomRes) {
      setBomLines(
        bomRes.lines.map((line, idx) => ({
          componentProductId: line.componentProductId,
          qtyPerKit: String(line.qtyPerKit),
          scrapPct: line.scrapPct != null ? String(line.scrapPct) : "",
          sortOrder: line.sortOrder ?? idx,
        })),
      );
    } else {
      setBomLines([{ componentProductId: "", qtyPerKit: "1", scrapPct: "", sortOrder: 0 }]);
    }
  }, []);

  const loadAvailability = useCallback(async (productId: string) => {
    setAvailability(await planningApi.getAvailability(productId));
  }, []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        rulesRes,
        settingsRes,
        snapshotsRes,
        qcRes,
        packingRes,
        launchRes,
        batchesRes,
        dashRes,
        projRes,
        freshnessRes,
      ] = await Promise.all([
        planningApi.getDemandRules(),
        planningApi.getSettings(),
        planningApi.listSnapshots(50),
        planningApi.getQcQueue(),
        planningApi.getPackingQueue(),
        planningApi.getLaunchRecommendations(horizonWeeks),
        planningApi.listBatches(),
        planningApi.getDashboard(),
        planningApi.getProjection([2, 4, 8, 12]),
        planningApi.getFreshness(),
      ]);
      setRules(rulesRes);
      setRulesDraft(rulesRes);
      setPlanningSettings(settingsRes);
      setSnapshots(snapshotsRes);
      setQcQueue(qcRes);
      setPackingQueue(packingRes);
      setLaunch(launchRes);
      setBatches(batchesRes);
      setPlanningDashboard(dashRes);
      setProjection(projRes);
      setFreshness(freshnessRes.snapshot);
      setSalesFreshness(freshnessRes.sales);
      setMrpStale(Boolean(freshnessRes.mrpStale));
      setMrpStaleWarning(freshnessRes.mrpStaleWarning ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t.errors.loadDashboard);
    } finally {
      setLoading(false);
    }
  }, [horizonWeeks, t.errors.loadDashboard]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard, refreshKey]);

  useEffect(() => {
    void loadProducts("");
  }, [loadProducts]);

  useEffect(() => {
    if (selectedProductId) {
      void loadAvailability(selectedProductId).catch((e: unknown) =>
        setError(e instanceof Error ? e.message : t.errors.loadDashboard),
      );
    } else {
      setAvailability(null);
    }
  }, [loadAvailability, selectedProductId, t.errors.loadDashboard]);

  useEffect(() => {
    if (selectedKitId) {
      void loadBomDetails(selectedKitId);
    } else {
      setBom(null);
      setCapacity(null);
      setBomLines([{ componentProductId: "", qtyPerKit: "1", scrapPct: "", sortOrder: 0 }]);
    }
  }, [loadBomDetails, selectedKitId]);

  const handleRefresh = async () => {
    setRefreshKey((v) => v + 1);
  };

  const handleSaveRules = async () => {
    setSavingRules(true);
    try {
      const saved = await planningApi.updateDemandRules(rulesDraft);
      setRules(saved);
      setRulesDraft(saved);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t.errors.saveRules);
    } finally {
      setSavingRules(false);
    }
  };

  const handleUploadSnapshot = async () => {
    if (!snapshotFile) {
      setSnapshotUploadError(t.errors.selectFile);
      return;
    }
    setUploadingSnapshot(true);
    setSnapshotUploadError(null);
    try {
      const res = await planningApi.uploadSnapshot(snapshotFile, snapshotNote.trim() || undefined);
      setUploadResult({
        snapshotId: res.snapshot.id,
        rowsInFile: res.rowsInFile,
        keptRows: res.keptRows,
        skippedIrrelevant: res.skippedIrrelevant,
        relevantSkuCount: res.relevantSkuCount,
        unresolvedSku: res.unresolvedSku,
        unresolvedWarehouses: res.unresolvedWarehouses,
      });
      setSnapshotFile(null);
      setSnapshotNote("");
      await handleRefresh();
    } catch (e: unknown) {
      setSnapshotUploadError(
        resolvePlanningUploadError(e, {
          fileTooLarge: t.errors.fileTooLarge,
          fallback: t.errors.uploadSnapshot,
        }),
      );
    } finally {
      setUploadingSnapshot(false);
    }
  };

  const handlePublishSnapshot = async (snapshotId: string) => {
    try {
      await planningApi.postSnapshot(snapshotId);
      await planningApi.runMrp("FULL");
      await handleRefresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t.errors.publishSnapshot);
    }
  };

  const handleCreateBomRevision = async () => {
    if (!selectedKitId) {
      setError(t.errors.selectKit);
      return;
    }
    setSavingBom(true);
    try {
      await planningApi.createBomRevision(selectedKitId, {
        lines: bomLines
          .filter((line) => line.componentProductId && Number(line.qtyPerKit) > 0)
          .map((line, idx) => ({
            componentProductId: line.componentProductId,
            qtyPerKit: Number(line.qtyPerKit),
            scrapPct: line.scrapPct ? Number(line.scrapPct) : undefined,
            sortOrder: idx,
          })),
      });
      await loadBomDetails(selectedKitId);
      await handleRefresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t.errors.createRevision);
    } finally {
      setSavingBom(false);
    }
  };

  const handleImportBomFile = async () => {
    if (!bomImportFile) {
      setBomUploadError(t.errors.selectFile);
      return;
    }
    setImportingBom(true);
    setBomUploadError(null);
    try {
      const result = await planningApi.importBomFile(bomImportFile);
      setBomImportResult(result);
      setBomImportFile(null);
      await loadProducts(kitSearch);
      if (selectedKitId) {
        await loadBomDetails(selectedKitId);
      }
      await handleRefresh();
    } catch (e: unknown) {
      setBomUploadError(
        resolvePlanningUploadError(e, {
          fileTooLarge: t.errors.fileTooLarge,
          fallback: t.errors.uploadBom,
        }),
      );
    } finally {
      setImportingBom(false);
    }
  };

  const handleCreateBatch = async () => {
    if (!batchForm.productId) {
      setError(t.errors.selectProduct);
      return;
    }
    setCreatingBatch(true);
    try {
      await planningApi.createBatch({
        code: batchForm.code,
        productId: batchForm.productId,
        qtyPlanned: Number(batchForm.qtyPlanned),
        dueAt: batchForm.dueAt || undefined,
      });
      setBatchForm({ code: "", productId: "", qtyPlanned: "", dueAt: "" });
      await handleRefresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t.errors.createBatch);
    } finally {
      setCreatingBatch(false);
    }
  };

  const handleMoveStage = async () => {
    if (!moveStageForm.batchId) return;
    setMovingBatchId(moveStageForm.batchId);
    try {
      await planningApi.moveBatchStage(moveStageForm.batchId, {
        toStageCode: moveStageForm.toStageCode,
        qtyInStage: moveStageForm.qtyInStage ? Number(moveStageForm.qtyInStage) : undefined,
        qtyGoodIncrement: moveStageForm.qtyGoodIncrement
          ? Number(moveStageForm.qtyGoodIncrement)
          : undefined,
        qtyScrapIncrement: moveStageForm.qtyScrapIncrement
          ? Number(moveStageForm.qtyScrapIncrement)
          : undefined,
        note: moveStageForm.note || undefined,
      });
      setMoveStageForm({
        batchId: "",
        toStageCode: "QC",
        qtyInStage: "",
        qtyGoodIncrement: "",
        qtyScrapIncrement: "",
        note: "",
      });
      await handleRefresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t.errors.moveStage);
    } finally {
      setMovingBatchId(null);
    }
  };

  const handleRunWeekly = async () => {
    setRunningWeekly(true);
    try {
      await planningApi.runWeeklyPlan();
      await handleRefresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t.errors.runWeeklyPlan);
    } finally {
      setRunningWeekly(false);
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">{t.pageTitle}</h1>
          <p className="mt-1 text-sm text-zinc-600">{t.pageSubtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setHowToOpen((v) => !v)}
            className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-medium text-cyan-900 hover:bg-cyan-100"
          >
            {t.actions.toggleHowTo}
          </button>
          <Link
            href="/help/planning-mrp-guide"
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {t.actions.openFullGuide}
          </Link>
          <HelpHint routeKey="planning" />
          <button
            type="button"
            onClick={() => void handleRefresh()}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {t.actions.refresh}
          </button>
          <button
            type="button"
            onClick={() => void handleRunWeekly()}
            disabled={runningWeekly}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
          >
            {runningWeekly ? strings.common.loading : t.actions.runWeeklyPlan}
          </button>
        </div>
      </div>

      <PlanningHowToPanel open={howToOpen} />

      {activeScreen !== "today" ? (
        <PlanningFreshnessBanners
          snapshot={freshness}
          sales={salesFreshness}
          mrpStale={mrpStale}
          mrpStaleWarning={mrpStaleWarning}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {PLANNING_SCREENS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setScreen(tab)}
            className={
              activeScreen === tab
                ? "rounded-full bg-cyan-600 px-4 py-2 text-sm font-medium text-white"
                : "rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            }
          >
            {t.tabs[tab]}
          </button>
        ))}
      </div>

      {loading && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
          {strings.common.loading}
        </div>
      )}
      {error && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="shrink-0 leading-none text-red-500 hover:text-red-800"
            aria-label={strings.common.close}
          >
            ×
          </button>
        </div>
      )}

      <>
        {activeScreen === "today" && (
          <TodayScreen onError={handleOpsError} onNavigate={setScreen} />
        )}

        {activeScreen === "pack" && <PackingPanel onError={handleOpsError} />}

        {activeScreen === "make" && <FactoryPanel onError={handleOpsError} />}

        {activeScreen === "data" && (
          <div className="space-y-3">
            {(
              [
                ["snapshots", t.dataSections.snapshots],
                ["sales", t.dataSections.sales],
                ["bom", t.dataSections.bom],
                ["settings", t.dataSections.settings],
                ["inventory", t.dataSections.inventory],
              ] as const
            ).map(([key, title]) => (
              <div key={key} className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-zinc-900"
                  onClick={() => setDataSection(dataSection === key ? "" : key)}
                >
                  {title}
                  <span className="text-zinc-400">{dataSection === key ? "▾" : "▸"}</span>
                </button>
                {dataSection === key ? (
                  <div className="border-t border-zinc-100 px-4 pb-4 pt-2">
                    {key === "inventory" ? (
            <div className="space-y-4">
              <p className="text-sm text-zinc-600">{t.messages.capacityHint}</p>
              <Panel title={t.labels.selectedProduct}>
                <ProductLookup
                  query={productSearch}
                  onQueryChange={setProductSearch}
                  products={products}
                  loading={productsLoading}
                  selectedId={selectedProductId}
                  onSelect={setSelectedProductId}
                  onSearch={() => void loadProducts(productSearch)}
                />
                {selectedProduct && availability && (
                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <StatCard title={t.labels.physical} value={String(availability.physical)} />
                    <StatCard title={t.labels.hardReserved} value={String(availability.hardReserved)} />
                    <StatCard title={t.labels.softReserved} value={String(availability.softReserved)} />
                    <StatCard title={t.labels.available} value={String(availability.available)} />
                    <StatCard title={t.labels.expectedOutput} value={String(availability.expectedOutput)} />
                  </div>
                )}
              </Panel>

              <Panel title={t.labels.selectedKit}>
                <ProductLookup
                  query={kitSearch}
                  onQueryChange={setKitSearch}
                  products={kitProducts}
                  loading={productsLoading}
                  selectedId={selectedKitId}
                  onSelect={setSelectedKitId}
                  onSearch={() => void loadProducts(kitSearch)}
                />
                {capacity && (
                  <div className="mt-4 space-y-3">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <StatCard
                        title={t.labels.maxBuildNow}
                        value={String(capacity.maxBuildNow)}
                        hint={t.labels.maxBuildNowHint}
                      />
                      <StatCard
                        title={t.labels.bottleneck}
                        value={
                          capacity.bottleneckComponentId
                            ? formatPlanningProductLabel(
                                capacity.components.find(
                                  (c) => c.componentProductId === capacity.bottleneckComponentId,
                                )?.product ?? null,
                                productNameById.get(capacity.bottleneckComponentId),
                                capacity.bottleneckComponentId,
                              )
                            : t.states.none
                        }
                      />
                    </div>
                    <SimpleTable
                      headers={[t.labels.component, t.labels.qty, t.labels.available, t.labels.ratio]}
                      rows={capacity.components.map((line) => [
                        formatPlanningProductLabel(
                          line.product,
                          productNameById.get(line.componentProductId),
                          line.componentProductId,
                        ),
                        String(line.qtyPerKit),
                        String(line.available),
                        line.ratio.toFixed(2),
                      ])}
                      noDataLabel={t.states.noData}
                    />
                  </div>
                )}
              </Panel>
            </div>
                    ) : key === "snapshots" ? (
            <div className="space-y-4">
              <p className="text-sm text-zinc-600">{t.messages.snapshotsHint}</p>
              <Panel title={t.actions.uploadSnapshot}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => {
                      setSnapshotFile(e.target.files?.[0] ?? null);
                      setSnapshotUploadError(null);
                    }}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                  <input
                    value={snapshotNote}
                    onChange={(e) => setSnapshotNote(e.target.value)}
                    placeholder={t.placeholders.note}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void handleUploadSnapshot()}
                    disabled={uploadingSnapshot}
                    className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
                  >
                    {uploadingSnapshot ? strings.common.loading : t.actions.uploadSnapshot}
                  </button>
                </div>
                {snapshotUploadError && (
                  <p className="mt-2 text-sm text-red-600">{snapshotUploadError}</p>
                )}
                <p className="mt-3 text-sm text-zinc-500">{t.messages.uploadHint}</p>
                {uploadResult && (
                  <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm">
                    <p>
                      {t.labels.result}: <span className="font-medium">{uploadResult.snapshotId}</span>
                    </p>
                    <p className="mt-2">
                      {t.messages.snapshotFilterSummary(
                        uploadResult.rowsInFile,
                        uploadResult.keptRows,
                        uploadResult.skippedIrrelevant,
                        uploadResult.relevantSkuCount,
                      )}
                    </p>
                    <p className="mt-2">
                      {t.labels.unresolvedSku}:{" "}
                      {uploadResult.unresolvedSku.length > 0
                        ? uploadResult.unresolvedSku.join(", ")
                        : t.states.none}
                    </p>
                    <p>
                      {t.labels.unresolvedWarehouses}:{" "}
                      {uploadResult.unresolvedWarehouses.length > 0
                        ? uploadResult.unresolvedWarehouses.join(", ")
                        : t.states.none}
                    </p>
                  </div>
                )}
              </Panel>

              <Panel title={t.labels.totalSnapshots}>
                <SimpleTable
                  headers={[
                    t.labels.status,
                    t.labels.source,
                    t.labels.importedAt,
                    t.labels.latestPosted,
                    t.labels.qty,
                    t.labels.actions,
                  ]}
                  rows={snapshots.map((snapshot) => [
                    snapshot.status,
                    snapshot.source,
                    formatDateTime(snapshot.importedAt),
                    snapshot.postedAt ? formatDateTime(snapshot.postedAt) : t.states.none,
                    String(snapshot._count?.lines ?? snapshot.lines?.length ?? 0),
                    snapshot.status === "STAGED" ? (
                      <button
                        type="button"
                        onClick={() => void handlePublishSnapshot(snapshot.id)}
                        className="rounded border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-800 hover:bg-cyan-100"
                      >
                        {t.actions.publishSnapshot}
                      </button>
                    ) : (
                      <span className="text-xs text-zinc-500">{t.states.none}</span>
                    ),
                  ])}
                  noDataLabel={t.states.noSnapshots}
                />
              </Panel>
            </div>
                    ) : key === "sales" ? (
                      <ForecastPanel onError={handleOpsError} />
                    ) : key === "bom" ? (
            <div className="space-y-4">
              <p className="text-sm text-zinc-600">{t.messages.bomHint}</p>
              <Panel title={t.actions.uploadBom}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => {
                      setBomImportFile(e.target.files?.[0] ?? null);
                      setBomUploadError(null);
                    }}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void handleImportBomFile()}
                    disabled={importingBom}
                    className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
                  >
                    {importingBom ? strings.common.loading : t.actions.uploadBom}
                  </button>
                </div>
                {bomUploadError && <p className="mt-2 text-sm text-red-600">{bomUploadError}</p>}
                <p className="mt-3 text-sm text-zinc-500">{t.messages.bomUploadHint}</p>
                {bomImportResult && (
                  <div className="mt-4 space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm">
                    {bomImportResult.format && (
                      <p>
                        {t.messages.bomImportSummary(
                          bomImportResult.format,
                          bomImportResult.parsedRowCount ?? 0,
                          bomImportResult.sheetsProcessed?.length ?? 0,
                          bomImportResult.skippedSheets?.length ?? 0,
                        )}
                      </p>
                    )}
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <StatCard title={t.labels.importedKits} value={String(bomImportResult.importedKitCount)} />
                      <StatCard title={t.labels.components} value={String(bomImportResult.importedLineCount)} />
                      <StatCard
                        title={t.labels.createdParts}
                        value={String(bomImportResult.createdPartCount ?? 0)}
                      />
                      <StatCard
                        title={t.labels.unresolvedKitSku}
                        value={String(bomImportResult.unresolvedKitSku.length)}
                      />
                      <StatCard
                        title={t.labels.rowsWithErrors}
                        value={String(bomImportResult.rowErrors.length)}
                      />
                      {typeof bomImportResult.skippedKitCount === "number" && (
                        <StatCard
                          title={t.labels.skippedKits}
                          value={String(bomImportResult.skippedKitCount)}
                        />
                      )}
                    </div>
                    <p>
                      {t.labels.unresolvedKitSku}:{" "}
                      {bomImportResult.unresolvedKitSku.length > 0
                        ? bomImportResult.unresolvedKitSku.join(", ")
                        : t.states.none}
                    </p>
                    <p>
                      {t.labels.unresolvedSku}:{" "}
                      {bomImportResult.unresolvedComponentSku.length > 0
                        ? bomImportResult.unresolvedComponentSku.join(", ")
                        : t.states.none}
                    </p>
                    <SimpleTable
                      headers={[t.labels.sku, t.labels.name, t.labels.revision, t.labels.components]}
                      rows={bomImportResult.importedKits.map((item) => [
                        item.kitSku,
                        item.kitName ?? t.states.none,
                        String(item.revision),
                        String(item.lines),
                      ])}
                      noDataLabel={t.states.noData}
                    />
                    <SimpleTable
                      headers={[t.labels.row, t.labels.sku, t.labels.component, t.labels.note]}
                      rows={bomImportResult.rowErrors.map((item) => [
                        String(item.rowNumber),
                        item.kitSku || t.states.none,
                        item.componentSku || t.states.none,
                        item.reason,
                      ])}
                      noDataLabel={t.states.noData}
                    />
                  </div>
                )}
              </Panel>
              <Panel title={t.labels.selectedKit}>
                <ProductLookup
                  query={kitSearch}
                  onQueryChange={setKitSearch}
                  products={kitProducts}
                  loading={productsLoading}
                  selectedId={selectedKitId}
                  onSelect={setSelectedKitId}
                  onSearch={() => void loadProducts(kitSearch)}
                />
                {bom && (
                  <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm">
                    <p>
                      {t.labels.revision}: <span className="font-medium">{bom.revision}</span>
                    </p>
                    <p>{t.labels.createdAt}: {formatDateTime(bom.effectiveFrom)}</p>
                  </div>
                )}
                {!bom && selectedKitId && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    {t.states.noBom}
                  </div>
                )}
              </Panel>

              <Panel title={t.labels.components}>
                <div className="space-y-3">
                  {bomLines.map((line, idx) => (
                    <div key={`${idx}-${line.componentProductId}`} className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
                      <select
                        value={line.componentProductId}
                        onChange={(e) =>
                          setBomLines((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, componentProductId: e.target.value } : item,
                            ),
                          )
                        }
                        className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                      >
                        <option value="">{t.actions.selectProduct}</option>
                        {partProducts.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.sku} - {product.name}
                          </option>
                        ))}
                      </select>
                      <input
                        value={line.qtyPerKit}
                        onChange={(e) =>
                          setBomLines((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, qtyPerKit: e.target.value } : item)),
                          )
                        }
                        placeholder={t.placeholders.qty}
                        className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                      />
                      <input
                        value={line.scrapPct}
                        onChange={(e) =>
                          setBomLines((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, scrapPct: e.target.value } : item)),
                          )
                        }
                        placeholder={t.placeholders.scrapPct}
                        className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setBomLines((prev) => prev.filter((_, i) => i !== idx))}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100"
                      >
                        {t.actions.removeLine}
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setBomLines((prev) => [
                          ...prev,
                          { componentProductId: "", qtyPerKit: "1", scrapPct: "", sortOrder: prev.length },
                        ])
                      }
                      className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      {t.actions.addLine}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCreateBomRevision()}
                      disabled={savingBom}
                      className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
                    >
                      {savingBom ? strings.common.loading : t.actions.createRevision}
                    </button>
                  </div>
                </div>
              </Panel>
            </div>
                    ) : key === "settings" ? (
            <div className="space-y-4">
              <MrpConfigPanel onError={handleOpsError} />
              <PlanningSettingsPanel
                settings={planningSettings}
                onSaved={(s) => {
                  setPlanningSettings(s);
                  void loadDashboard();
                }}
                onError={(msg) => setError(msg)}
              />
              <Panel title={t.labels.demandRules}>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <StageChecklist
                    title={t.labels.hardRules}
                    values={rulesDraft.hardStages}
                    onToggle={(stage) =>
                      setRulesDraft((prev) => ({
                        ...prev,
                        hardStages: prev.hardStages.includes(stage)
                          ? prev.hardStages.filter((x) => x !== stage)
                          : [...prev.hardStages, stage],
                      }))
                    }
                    labelFor={orderStageLabel}
                  />
                  <StageChecklist
                    title={t.labels.softRules}
                    values={rulesDraft.softStages}
                    onToggle={(stage) =>
                      setRulesDraft((prev) => ({
                        ...prev,
                        softStages: prev.softStages.includes(stage)
                          ? prev.softStages.filter((x) => x !== stage)
                          : [...prev.softStages, stage],
                      }))
                    }
                    labelFor={orderStageLabel}
                  />
                </div>
                <label className="mt-4 flex items-center gap-2 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={rulesDraft.includeOrderItemsWithoutProductIdAsSoft}
                    onChange={(e) =>
                      setRulesDraft((prev) => ({
                        ...prev,
                        includeOrderItemsWithoutProductIdAsSoft: e.target.checked,
                      }))
                    }
                  />
                  {t.labels.includeUnmapped}
                </label>
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => void handleSaveRules()}
                    disabled={savingRules}
                    className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
                  >
                    {savingRules ? strings.common.loading : t.actions.saveRules}
                  </button>
                </div>
              </Panel>
            </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      {title && <h2 className="mb-3 text-base font-semibold text-zinc-900">{title}</h2>}
      {children}
    </div>
  );
}

function StatCard({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-zinc-500">
        {title}
        {hint ? (
          <span className="ml-1 cursor-help text-xs" title={hint}>
            ⓘ
          </span>
        ) : null}
      </p>
      <p className="mt-2 text-sm font-medium text-zinc-900">{value}</p>
    </div>
  );
}

function ProductLookup({
  query,
  onQueryChange,
  products,
  loading,
  selectedId,
  onSelect,
  onSearch,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  products: ProductCatalogItem[];
  loading: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  onSearch: () => void;
}) {
  const t = strings.planning;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_auto]">
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t.placeholders.productSearch}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={onSearch}
          className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          {loading ? strings.common.loading : strings.common.search}
        </button>
      </div>
      <select
        value={selectedId}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
      >
        <option value="">{t.actions.selectProduct}</option>
        {products.map((product) => (
          <option key={product.id} value={product.id}>
            {product.sku} - {product.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function StageChecklist({
  title,
  values,
  onToggle,
  labelFor,
}: {
  title: string;
  values: string[];
  onToggle: (value: string) => void;
  labelFor: (value: string) => string;
}) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-zinc-900">{title}</h3>
      <div className="space-y-2">
        {ORDER_STAGE_VALUES.map((value) => (
          <label key={value} className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={values.includes(value)}
              onChange={() => onToggle(value)}
            />
            {labelFor(value)}
          </label>
        ))}
      </div>
    </div>
  );
}

function SimpleTable({
  headers,
  rows,
  noDataLabel,
}: {
  headers: string[];
  rows: Array<Array<React.ReactNode>>;
  noDataLabel: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-zinc-200 text-sm">
        <thead>
          <tr className="bg-zinc-50">
            {headers.map((header) => (
              <th key={header} className="px-3 py-2 text-left font-medium text-zinc-600">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.length === 0 ? (
            <tr>
              <td className="px-3 py-6 text-zinc-500" colSpan={headers.length}>
                {noDataLabel}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {row.map((cell, cellIdx) => (
                  <td key={`${rowIdx}-${cellIdx}`} className="px-3 py-2 align-top text-zinc-900">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function BatchMiniList({
  batches,
  stageLabel,
  emptyLabel,
}: {
  batches: ProductionBatch[];
  stageLabel: (code: string | null | undefined) => string;
  emptyLabel: string;
}) {
  if (batches.length === 0) return <p className="text-sm text-zinc-500">{emptyLabel}</p>;
  return (
    <ul className="space-y-3">
      {batches.map((batch) => (
        <li key={batch.id} className="rounded-lg border border-zinc-200 p-3 text-sm">
          <div className="font-medium text-zinc-900">{batch.code}</div>
          <div className="text-zinc-600">{batch.product?.name ?? batch.productId}</div>
          <div className="mt-1 text-zinc-500">{stageLabel(batch.currentStage?.code)}</div>
        </li>
      ))}
    </ul>
  );
}

function formatPlanningProductLabel(
  product: { sku: string; name: string } | null | undefined,
  catalog: ProductCatalogItem | undefined,
  fallbackId: string,
): string {
  if (product) return `${product.sku} — ${product.name}`;
  if (catalog) return `${catalog.sku} — ${catalog.name}`;
  return fallbackId;
}

function RecommendationsTable({
  recommendations,
  productsById,
  noDataLabel,
}: {
  recommendations: Array<{
    productId: string;
    product: { sku: string; name: string } | null;
    hardNeed: number;
    softNeed: number;
    available: number;
    expectedOutput: number;
    deficit: number;
    suggestedLaunchQty: number;
  }>;
  productsById: Map<string, ProductCatalogItem>;
  noDataLabel: string;
}) {
  const t = strings.planning;
  return (
    <SimpleTable
      headers={[
        t.labels.product,
        t.labels.available,
        t.labels.expectedOutput,
        t.labels.hardShort,
        t.labels.softShort,
        t.labels.deficit,
        t.labels.launch,
      ]}
      rows={recommendations.map((item) => [
        formatPlanningProductLabel(item.product, productsById.get(item.productId), item.productId),
        String(item.available),
        String(item.expectedOutput),
        String(item.hardNeed),
        String(item.softNeed),
        String(item.deficit),
        String(item.suggestedLaunchQty),
      ])}
      noDataLabel={noDataLabel}
    />
  );
}

