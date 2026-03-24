"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { strings } from "@/locales";
import {
  planningApi,
  type ActiveBom,
  type BomImportResult,
  type DemandRules,
  type InventorySnapshot,
  type KitCapacity,
  type LaunchRecommendationsResponse,
  type PlanningAvailability,
  type ProductionBatch,
} from "@/lib/api/resources/planning";
import { productsApi, type ProductCatalogItem } from "@/lib/api/resources/products";

type PlanningTab = "dashboard" | "inventory" | "snapshots" | "bom" | "batches" | "queues" | "settings";

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
] as const;

const PRODUCTION_STAGE_VALUES = ["MECH", "DEGREASE", "QC", "PACK", "TRANSFER"] as const;

export default function PlanningPage() {
  const t = strings.planning;
  const [activeTab, setActiveTab] = useState<PlanningTab>("dashboard");
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
  const [latestSnapshot, setLatestSnapshot] = useState<InventorySnapshot | null>(null);
  const [qcQueue, setQcQueue] = useState<ProductionBatch[]>([]);
  const [packingQueue, setPackingQueue] = useState<ProductionBatch[]>([]);
  const [launch, setLaunch] = useState<LaunchRecommendationsResponse | null>(null);
  const [batches, setBatches] = useState<ProductionBatch[]>([]);

  const [productSearch, setProductSearch] = useState("");
  const [products, setProducts] = useState<ProductCatalogItem[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedKitId, setSelectedKitId] = useState<string>("");
  const [availability, setAvailability] = useState<PlanningAvailability | null>(null);
  const [bom, setBom] = useState<ActiveBom | null>(null);
  const [capacity, setCapacity] = useState<KitCapacity | null>(null);

  const [bomImportFile, setBomImportFile] = useState<File | null>(null);
  const [importingBom, setImportingBom] = useState(false);
  const [bomImportResult, setBomImportResult] = useState<BomImportResult | null>(null);
  const [snapshotFile, setSnapshotFile] = useState<File | null>(null);
  const [snapshotNote, setSnapshotNote] = useState("");
  const [uploadingSnapshot, setUploadingSnapshot] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    snapshotId: string;
    unresolvedSku: string[];
    unresolvedWarehouses: string[];
  } | null>(null);

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

  const productNameById = useMemo(() => {
    const map = new Map<string, ProductCatalogItem>();
    products.forEach((item) => map.set(item.id, item));
    return map;
  }, [products]);

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
      const res = await productsApi.listCatalog({ search, pageSize: 100, page: 1 });
      setProducts(res.items);
    } catch {
      throw new Error(t.errors.loadProducts);
    } finally {
      setProductsLoading(false);
    }
  }, [t.errors.loadProducts]);

  const loadBomDetails = useCallback(async (kitId: string) => {
    try {
      const [bomRes, capacityRes] = await Promise.all([
        planningApi.getBom(kitId),
        planningApi.getKitCapacity(kitId),
      ]);
      setBom(bomRes);
      setCapacity(capacityRes);
      setBomLines(
        bomRes.lines.map((line, idx) => ({
          componentProductId: line.componentProductId,
          qtyPerKit: String(line.qtyPerKit),
          scrapPct: line.scrapPct != null ? String(line.scrapPct) : "",
          sortOrder: line.sortOrder ?? idx,
        })),
      );
    } catch {
      setBom(null);
      setCapacity(null);
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
      const [rulesRes, snapshotsRes, latestRes, qcRes, packingRes, launchRes, batchesRes] =
        await Promise.all([
          planningApi.getDemandRules(),
          planningApi.listSnapshots(50),
          planningApi.getLatestPostedSnapshot(),
          planningApi.getQcQueue(),
          planningApi.getPackingQueue(),
          planningApi.getLaunchRecommendations(horizonWeeks),
          planningApi.listBatches(),
        ]);
      setRules(rulesRes);
      setRulesDraft(rulesRes);
      setSnapshots(snapshotsRes);
      setLatestSnapshot(latestRes);
      setQcQueue(qcRes);
      setPackingQueue(packingRes);
      setLaunch(launchRes);
      setBatches(batchesRes);
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
      setError(t.errors.selectFile);
      return;
    }
    setUploadingSnapshot(true);
    try {
      const res = await planningApi.uploadSnapshot(snapshotFile, snapshotNote.trim() || undefined);
      setUploadResult({
        snapshotId: res.snapshot.id,
        unresolvedSku: res.unresolvedSku,
        unresolvedWarehouses: res.unresolvedWarehouses,
      });
      setSnapshotFile(null);
      setSnapshotNote("");
      await handleRefresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t.errors.uploadSnapshot);
    } finally {
      setUploadingSnapshot(false);
    }
  };

  const handlePublishSnapshot = async (snapshotId: string) => {
    try {
      await planningApi.postSnapshot(snapshotId);
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
      setError(t.errors.selectFile);
      return;
    }
    setImportingBom(true);
    try {
      const result = await planningApi.importBomFile(bomImportFile);
      setBomImportResult(result);
      setBomImportFile(null);
      if (selectedKitId) {
        await loadBomDetails(selectedKitId);
      }
      await handleRefresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t.errors.uploadBom);
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
        <div className="flex gap-2">
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

      <div className="flex flex-wrap gap-2">
        {(
          [
            "dashboard",
            "inventory",
            "snapshots",
            "bom",
            "batches",
            "queues",
            "settings",
          ] as PlanningTab[]
        ).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={
              activeTab === tab
                ? "rounded-full bg-cyan-600 px-4 py-2 text-sm font-medium text-white"
                : "rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            }
          >
            {t.tabs[tab]}
          </button>
        ))}
      </div>

      {loading && <Panel>{strings.common.loading}</Panel>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {!loading && (
        <>
          {activeTab === "dashboard" && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-600">{t.messages.dashboardHint}</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  title={t.labels.hardRules}
                  value={(rules?.hardStages ?? []).map(orderStageLabel).join(", ") || t.states.none}
                />
                <StatCard
                  title={t.labels.latestPosted}
                  value={
                    latestSnapshot?.postedAt
                      ? new Date(latestSnapshot.postedAt).toLocaleString("uk-UA")
                      : t.states.none
                  }
                />
                <StatCard title={t.labels.qcQueue} value={String(qcQueue.length)} />
                <StatCard title={t.labels.launchRecommendations} value={String(launch?.recommendations.length ?? 0)} />
              </div>
              <Panel title={t.labels.launchRecommendations}>
                <RecommendationsTable
                  recommendations={launch?.recommendations ?? []}
                  productsById={productNameById}
                  noDataLabel={t.states.noRecommendations}
                />
              </Panel>
            </div>
          )}

          {activeTab === "inventory" && (
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
                  query={productSearch}
                  onQueryChange={setProductSearch}
                  products={products}
                  loading={productsLoading}
                  selectedId={selectedKitId}
                  onSelect={setSelectedKitId}
                  onSearch={() => void loadProducts(productSearch)}
                />
                {capacity && (
                  <div className="mt-4 space-y-3">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <StatCard title={t.labels.maxBuildNow} value={String(capacity.maxBuildNow)} />
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
          )}

          {activeTab === "snapshots" && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-600">{t.messages.snapshotsHint}</p>
              <Panel title={t.actions.uploadSnapshot}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => setSnapshotFile(e.target.files?.[0] ?? null)}
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
                <p className="mt-3 text-sm text-zinc-500">{t.messages.uploadHint}</p>
                {uploadResult && (
                  <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm">
                    <p>
                      {t.labels.result}: <span className="font-medium">{uploadResult.snapshotId}</span>
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
                    formatDate(snapshot.importedAt),
                    snapshot.postedAt ? formatDate(snapshot.postedAt) : t.states.none,
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
          )}

          {activeTab === "bom" && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-600">{t.messages.bomHint}</p>
              <Panel title={t.actions.uploadBom}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => setBomImportFile(e.target.files?.[0] ?? null)}
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
                <p className="mt-3 text-sm text-zinc-500">{t.messages.bomUploadHint}</p>
                {bomImportResult && (
                  <div className="mt-4 space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <StatCard title={t.labels.importedKits} value={String(bomImportResult.importedKitCount)} />
                      <StatCard title={t.labels.components} value={String(bomImportResult.importedLineCount)} />
                      <StatCard
                        title={t.labels.unresolvedKitSku}
                        value={String(bomImportResult.unresolvedKitSku.length)}
                      />
                      <StatCard
                        title={t.labels.rowsWithErrors}
                        value={String(bomImportResult.rowErrors.length)}
                      />
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
                  query={productSearch}
                  onQueryChange={setProductSearch}
                  products={products}
                  loading={productsLoading}
                  selectedId={selectedKitId}
                  onSelect={setSelectedKitId}
                  onSearch={() => void loadProducts(productSearch)}
                />
                {bom && (
                  <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm">
                    <p>
                      {t.labels.revision}: <span className="font-medium">{bom.revision}</span>
                    </p>
                    <p>{t.labels.createdAt}: {formatDate(bom.effectiveFrom)}</p>
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
                        {products.map((product) => (
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
          )}

          {activeTab === "batches" && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-600">{t.messages.batchesHint}</p>
              <Panel title={t.actions.createBatch}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <input
                    value={batchForm.code}
                    onChange={(e) => setBatchForm((prev) => ({ ...prev, code: e.target.value }))}
                    placeholder={t.placeholders.batchCode}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                  <select
                    value={batchForm.productId}
                    onChange={(e) => setBatchForm((prev) => ({ ...prev, productId: e.target.value }))}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  >
                    <option value="">{t.actions.selectProduct}</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.sku} - {product.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={batchForm.qtyPlanned}
                    onChange={(e) => setBatchForm((prev) => ({ ...prev, qtyPlanned: e.target.value }))}
                    placeholder={t.placeholders.qty}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                  <input
                    type="date"
                    value={batchForm.dueAt}
                    onChange={(e) => setBatchForm((prev) => ({ ...prev, dueAt: e.target.value }))}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => void handleCreateBatch()}
                    disabled={creatingBatch}
                    className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
                  >
                    {creatingBatch ? strings.common.loading : t.actions.createBatch}
                  </button>
                </div>
              </Panel>

              <Panel title={t.tabs.batches}>
                <SimpleTable
                  headers={[
                    t.labels.batchCode,
                    t.labels.product,
                    t.labels.qtyPlanned,
                    t.labels.qtyGood,
                    t.labels.qtyScrap,
                    t.labels.currentStage,
                    t.labels.dueAt,
                  ]}
                  rows={batches.map((batch) => [
                    batch.code,
                    `${batch.product?.sku ?? batch.productId} - ${batch.product?.name ?? ""}`,
                    String(batch.qtyPlanned),
                    String(batch.qtyGood),
                    String(batch.qtyScrap),
                    stageLabel(batch.currentStage?.code),
                    batch.dueAt ? formatDate(batch.dueAt) : t.states.none,
                  ])}
                  noDataLabel={t.states.noBatches}
                />
              </Panel>

              <Panel title={t.actions.moveStage}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                  <select
                    value={moveStageForm.batchId}
                    onChange={(e) => setMoveStageForm((prev) => ({ ...prev, batchId: e.target.value }))}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  >
                    <option value="">{t.actions.selectProduct}</option>
                    {batches.map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {batch.code} - {batch.product?.name ?? batch.productId}
                      </option>
                    ))}
                  </select>
                  <select
                    value={moveStageForm.toStageCode}
                    onChange={(e) => setMoveStageForm((prev) => ({ ...prev, toStageCode: e.target.value }))}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  >
                    {PRODUCTION_STAGE_VALUES.map((stageCode) => (
                      <option key={stageCode} value={stageCode}>
                        {stageLabel(stageCode)}
                      </option>
                    ))}
                  </select>
                  <input
                    value={moveStageForm.qtyInStage}
                    onChange={(e) => setMoveStageForm((prev) => ({ ...prev, qtyInStage: e.target.value }))}
                    placeholder={t.labels.qty}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                  <input
                    value={moveStageForm.qtyGoodIncrement}
                    onChange={(e) => setMoveStageForm((prev) => ({ ...prev, qtyGoodIncrement: e.target.value }))}
                    placeholder={t.labels.qtyGood}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                  <input
                    value={moveStageForm.qtyScrapIncrement}
                    onChange={(e) => setMoveStageForm((prev) => ({ ...prev, qtyScrapIncrement: e.target.value }))}
                    placeholder={t.labels.qtyScrap}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </div>
                <textarea
                  value={moveStageForm.note}
                  onChange={(e) => setMoveStageForm((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder={t.placeholders.note}
                  className="mt-3 min-h-24 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => void handleMoveStage()}
                    disabled={!moveStageForm.batchId || movingBatchId === moveStageForm.batchId}
                    className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
                  >
                    {movingBatchId === moveStageForm.batchId ? strings.common.loading : t.actions.moveStage}
                  </button>
                </div>
              </Panel>
            </div>
          )}

          {activeTab === "queues" && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-600">{t.messages.queuesHint}</p>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-zinc-700">{t.labels.horizon}</span>
                <select
                  value={horizonWeeks}
                  onChange={(e) => setHorizonWeeks(Number(e.target.value))}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  <option value={1}>{t.labels.oneWeek}</option>
                  <option value={2}>{t.labels.twoWeeks}</option>
                  <option value={4}>{t.labels.fourWeeks}</option>
                </select>
              </div>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <Panel title={t.labels.qcQueue}>
                  <BatchMiniList batches={qcQueue} stageLabel={stageLabel} emptyLabel={t.states.noQueueItems} />
                </Panel>
                <Panel title={t.labels.packingQueue}>
                  <BatchMiniList batches={packingQueue} stageLabel={stageLabel} emptyLabel={t.states.noQueueItems} />
                </Panel>
                <Panel title={t.labels.launchRecommendations}>
                  <RecommendationsTable
                    recommendations={launch?.recommendations ?? []}
                    productsById={productNameById}
                    noDataLabel={t.states.noRecommendations}
                  />
                </Panel>
              </div>
            </div>
          )}

          {activeTab === "settings" && (
            <div className="space-y-4">
              <Panel title={t.tabs.settings}>
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
          )}
        </>
      )}
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("uk-UA");
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

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-zinc-500">{title}</p>
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

