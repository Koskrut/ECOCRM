import test from "node:test";
import assert from "node:assert/strict";
import {
  buildKitBoard,
  groupSnapshotStock,
  isExcludedPlanningWarehouse,
  kitNeed,
  kitsOnWarehouse,
  productGroupNameFromSku,
  resolveKitCategory,
  resolveKitSystem,
} from "../kit-board.util";

const warehouses = [
  { id: "a", name: "A" },
  { id: "b", name: "B" },
];

const monthKeys = [
  "2025-01",
  "2025-02",
  "2025-03",
  "2025-04",
  "2025-05",
  "2025-06",
  "2025-07",
  "2025-08",
  "2025-09",
  "2025-10",
  "2025-11",
  "2025-12",
];

function flatMonthly(qty: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of monthKeys) out[key] = qty;
  return out;
}

test("kitNeed is zero without sales and does not double-count stock", () => {
  assert.equal(kitNeed(0, 10, 1), 0);
  assert.equal(kitNeed(8, 10, 1), 0);
  assert.equal(kitNeed(10, 2, 1), 8);
  assert.equal(kitNeed(10.2, 10, 1), 1);
});

test("parts on different warehouses do not add up into one kit", () => {
  const parts = [
    {
      productId: "p1",
      sku: "P1",
      name: "P1",
      qtyPerKit: 1,
      scrapPct: 0,
      constrains: true,
      qtyByWarehouse: { a: 5, b: 0 },
    },
    {
      productId: "p2",
      sku: "P2",
      name: "P2",
      qtyPerKit: 1,
      scrapPct: 0,
      constrains: true,
      qtyByWarehouse: { a: 0, b: 5 },
    },
  ];
  assert.equal(kitsOnWarehouse(parts, "a"), 0);
  assert.equal(kitsOnWarehouse(parts, "b"), 0);
});

test("packaging does not limit how many kits one warehouse can build", () => {
  const parts = [
    {
      productId: "metal",
      sku: "M",
      name: "Metal",
      qtyPerKit: 1,
      scrapPct: 0,
      constrains: true,
      qtyByWarehouse: { a: 4 },
    },
    {
      productId: "pkg",
      sku: "PKG:blister",
      name: "Blister",
      qtyPerKit: 1,
      scrapPct: 0,
      constrains: false,
      qtyByWarehouse: { a: 0 },
    },
  ];
  assert.equal(kitsOnWarehouse(parts, "a"), 4);
});

test("board packs only the sales gap and gives a shared part to the larger need", () => {
  const part = {
    productId: "bolt",
    sku: "BOLT",
    name: "Bolt",
    qtyPerKit: 1,
    scrapPct: 0,
    constrains: true,
    qtyByWarehouse: { a: 100, b: 0 },
  };
  const rows = buildKitBoard({
    coverMonths: 1,
    monthKeys,
    warehouses,
    kits: [
      {
        productId: "kit-b",
        sku: "B",
        name: "Kit B",
        qtyByWarehouse: { a: 0, b: 0 },
        avgMonthlySold: 50,
        revenue: 500,
        monthlySold: flatMonthly(50),
        system: "Straumann RC",
        category: "Абатмент",
        parts: [part],
      },
      {
        productId: "kit-a",
        sku: "A",
        name: "Kit A",
        qtyByWarehouse: { a: 0, b: 0 },
        avgMonthlySold: 80,
        revenue: 8000,
        monthlySold: flatMonthly(80),
        system: "Straumann RC",
        category: "Абатмент",
        parts: [part],
      },
      {
        productId: "kit-ok",
        sku: "OK",
        name: "Covered",
        qtyByWarehouse: { a: 40, b: 0 },
        avgMonthlySold: 10,
        revenue: 100,
        monthlySold: flatMonthly(10),
        system: "MegaGen AnyRidge",
        category: null,
        parts: [part],
      },
      {
        productId: "kit-nosales",
        sku: "Z",
        name: "No sales",
        qtyByWarehouse: { a: 0, b: 0 },
        avgMonthlySold: 0,
        revenue: 0,
        monthlySold: {},
        system: "ICX",
        category: "Гвинт",
        parts: [part],
      },
    ],
  });

  const bySku = new Map(rows.map((row) => [row.sku, row]));
  assert.equal(bySku.get("A")?.need, 80);
  assert.equal(bySku.get("A")?.canAssemble, 100);
  assert.equal(bySku.get("A")?.toPack, 80);
  assert.equal(bySku.get("A")?.toProduce, 0);
  assert.equal(bySku.get("A")?.tone, "pack");
  assert.equal(bySku.get("A")?.toPackWarehouseId, "a");
  assert.equal(bySku.get("A")?.paretoClass, "A");

  assert.equal(bySku.get("B")?.canAssemble, 100);
  assert.equal(bySku.get("B")?.toPack, 20);
  assert.equal(bySku.get("B")?.toProduce, 30);
  assert.equal(bySku.get("B")?.tone, "pack");

  assert.equal(bySku.get("OK")?.need, 0);
  assert.equal(bySku.get("OK")?.toPack, 0);
  assert.equal(bySku.get("OK")?.toProduce, 0);
  assert.equal(bySku.get("OK")?.tone, "enough");

  assert.equal(bySku.get("Z")?.toPack, 0);
  assert.equal(bySku.get("Z")?.toProduce, 0);
  assert.equal(bySku.get("Z")?.tone, "no_sales");
  assert.equal(rows[0]?.sku, "A");
});

test("toProduce is the gap after packing what parts can cover", () => {
  const part = {
    productId: "bolt",
    sku: "BOLT",
    name: "Bolt",
    qtyPerKit: 1,
    scrapPct: 0,
    constrains: true,
    qtyByWarehouse: { a: 8, b: 0 },
  };
  const rows = buildKitBoard({
    coverMonths: 3,
    monthKeys,
    warehouses,
    kits: [
      {
        productId: "kit",
        sku: "K1",
        name: "Kit",
        qtyByWarehouse: { a: 4, b: 0 },
        avgMonthlySold: 10,
        revenue: 1000,
        monthlySold: flatMonthly(10),
        system: "Straumann RC",
        category: "Абатмент",
        parts: [part],
      },
    ],
  });
  // need = ceil(10*3 - 4) = 26; can assemble 8 → pack 8, produce 18
  assert.equal(rows[0]?.need, 26);
  assert.equal(rows[0]?.toPack, 8);
  assert.equal(rows[0]?.toProduce, 18);
});

test("stock covering 3 months leaves pack and produce at zero", () => {
  const part = {
    productId: "bolt",
    sku: "BOLT",
    name: "Bolt",
    qtyPerKit: 1,
    scrapPct: 0,
    constrains: true,
    qtyByWarehouse: { a: 50, b: 0 },
  };
  const rows = buildKitBoard({
    coverMonths: 3,
    monthKeys,
    warehouses,
    kits: [
      {
        productId: "kit",
        sku: "K2",
        name: "Kit",
        qtyByWarehouse: { a: 40, b: 0 },
        avgMonthlySold: 10,
        revenue: 1000,
        monthlySold: flatMonthly(10),
        system: "Straumann RC",
        category: "Абатмент",
        parts: [part],
      },
    ],
  });
  assert.equal(rows[0]?.need, 0);
  assert.equal(rows[0]?.toPack, 0);
  assert.equal(rows[0]?.toProduce, 0);
});

test("part with larger exploded demand gets A and sorts above C", () => {
  const high = {
    productId: "high",
    sku: "HIGH",
    name: "High",
    qtyPerKit: 50,
    scrapPct: 0,
    constrains: true,
    qtyByWarehouse: { a: 500 },
  };
  const low = {
    productId: "low",
    sku: "LOW",
    name: "Low",
    qtyPerKit: 1,
    scrapPct: 0,
    constrains: true,
    qtyByWarehouse: { a: 100 },
  };
  const rows = buildKitBoard({
    coverMonths: 3,
    monthKeys,
    warehouses,
    kits: [
      {
        productId: "kit",
        sku: "01-KIT",
        name: "Kit",
        qtyByWarehouse: { a: 0 },
        avgMonthlySold: 20,
        revenue: 5000,
        monthlySold: flatMonthly(20),
        system: "Straumann RC",
        category: "Абатмент",
        parts: [low, high],
      },
    ],
  });
  const parts = rows[0]?.parts ?? [];
  assert.equal(parts[0]?.sku, "HIGH");
  assert.equal(parts[0]?.paretoClass, "A");
  assert.equal(parts[1]?.sku, "LOW");
  assert.equal(parts[1]?.paretoClass, "C");
});

test("system falls back to SKU group; category from characteristics", () => {
  assert.equal(productGroupNameFromSku("01-ABC"), "Straumann RC");
  assert.equal(
    resolveKitSystem("01-ABC", { implant_system: "Custom System" }),
    "Custom System",
  );
  assert.equal(resolveKitSystem("03-XYZ", null), "MegaGen AnyRidge");
  assert.equal(resolveKitCategory({ category_name: "Абатмент" }), "Абатмент");
  assert.equal(resolveKitCategory(null), null);
});

test("stock columns follow the file warehouse names, even when they are not in the CRM directory", () => {
  const grouped = groupSnapshotStock([
    {
      productId: "kit",
      qty: 4,
      warehouseId: null,
      warehouseRaw: "44 Склад Готової продукції (СУПРЕКС)",
    },
    {
      productId: "kit",
      qty: 2,
      warehouseId: null,
      warehouseRaw: "12 Склад Suprex",
    },
    {
      productId: "part",
      qty: 9,
      warehouseId: null,
      warehouseRaw: "12 Склад Suprex",
    },
    {
      productId: "part",
      qty: 1,
      warehouseId: "wh-kyiv",
      warehouseRaw: null,
      warehouseName: "Киев",
    },
    {
      productId: "part",
      qty: 0,
      warehouseId: null,
      warehouseRaw: "Порожній",
    },
  ]);

  assert.deepEqual(
    grouped.warehouses.map((w) => w.name),
    ["12 Склад Suprex", "44 Склад Готової продукції (СУПРЕКС)", "Киев"],
  );
  assert.equal(grouped.qtyByProduct.get("kit")?.[grouped.warehouses[0]!.id], 2);
  assert.equal(grouped.qtyByProduct.get("part")?.[grouped.warehouses[0]!.id], 9);
});

test("manager stocks, returns, and hardening are not company warehouses", () => {
  assert.equal(isExcludedPlanningWarehouse("ВОЗВРАТЫ"), true);
  assert.equal(isExcludedPlanningWarehouse("Закалка"), true);
  assert.equal(isExcludedPlanningWarehouse("Склад Бауэрс-Амел  (Киев)"), true);
  assert.equal(isExcludedPlanningWarehouse("12 Склад Suprex"), false);

  const grouped = groupSnapshotStock([
    {
      productId: "kit",
      qty: 5,
      warehouseId: null,
      warehouseRaw: "12 Склад Suprex",
    },
    {
      productId: "kit",
      qty: 9,
      warehouseId: null,
      warehouseRaw: "Склад Яромщук Альбіна (Харків)",
    },
    {
      productId: "part",
      qty: 3,
      warehouseId: null,
      warehouseRaw: "ВОЗВРАТЫ",
    },
  ]);

  assert.deepEqual(
    grouped.warehouses.map((w) => w.name),
    ["12 Склад Suprex"],
  );
  assert.equal(grouped.qtyByProduct.get("kit")?.[grouped.warehouses[0]!.id], 5);
  assert.equal(grouped.qtyByProduct.has("part"), false);
});

test("scrap reduces how many kits a part can cover", () => {
  const n = kitsOnWarehouse(
    [
      {
        productId: "p",
        sku: "P",
        name: "P",
        qtyPerKit: 2,
        scrapPct: 50,
        constrains: true,
        qtyByWarehouse: { a: 10 },
      },
    ],
    "a",
  );
  assert.equal(n, 3);
});
