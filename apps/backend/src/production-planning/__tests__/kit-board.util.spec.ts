import test from "node:test";
import assert from "node:assert/strict";
import {
  buildKitBoard,
  groupSnapshotStock,
  isExcludedPlanningWarehouse,
  isKitStockWarehouse,
  isPackRecommendationWarehouse,
  KIT_BOARD_PACK_POOL_ID,
  kitNeed,
  kitsOnPackPool,
  kitsOnWarehouse,
  productGroupNameFromSku,
  resolveKitCategory,
  resolveKitSystem,
} from "../kit-board.util";

/** Pack = 39/40 ABM; kit stock = 44 + Suprex. */
const warehouses = [
  { id: "pf", name: "39 ABM Склад Напівфабрикатів" },
  { id: "gp", name: "40 ABM Склад Готової продукції" },
  { id: "s44", name: "44 Склад Готової продукції (СУПРЕКС)" },
  { id: "sky", name: "Склад Suprex Киев" },
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

test("single-warehouse build ignores parts on another warehouse", () => {
  const parts = [
    {
      productId: "p1",
      sku: "P1",
      name: "P1",
      qtyPerKit: 1,
      scrapPct: 0,
      constrains: true,
      qtyByWarehouse: { pf: 5, gp: 0 },
    },
    {
      productId: "p2",
      sku: "P2",
      name: "P2",
      qtyPerKit: 1,
      scrapPct: 0,
      constrains: true,
      qtyByWarehouse: { pf: 0, gp: 5 },
    },
  ];
  assert.equal(kitsOnWarehouse(parts, "pf"), 0);
  assert.equal(kitsOnWarehouse(parts, "gp"), 0);
});

test("pack pool sums constraining parts across 39 and 40 ABM", () => {
  const parts = [
    {
      productId: "p1",
      sku: "P1",
      name: "P1",
      qtyPerKit: 1,
      scrapPct: 0,
      constrains: true,
      qtyByWarehouse: { pf: 5, gp: 0 },
    },
    {
      productId: "p2",
      sku: "P2",
      name: "P2",
      qtyPerKit: 1,
      scrapPct: 0,
      constrains: true,
      qtyByWarehouse: { pf: 0, gp: 5 },
    },
  ];
  assert.equal(kitsOnPackPool(parts, ["pf", "gp"]), 5);
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
      qtyByWarehouse: { pf: 4 },
    },
    {
      productId: "pkg",
      sku: "PKG:blister",
      name: "Blister",
      qtyPerKit: 1,
      scrapPct: 0,
      constrains: false,
      qtyByWarehouse: { pf: 0 },
    },
  ];
  assert.equal(kitsOnWarehouse(parts, "pf"), 4);
});

test("board packs only the sales gap and gives a shared part to the larger need", () => {
  const part = {
    productId: "bolt",
    sku: "BOLT",
    name: "Bolt",
    qtyPerKit: 1,
    scrapPct: 0,
    constrains: true,
    qtyByWarehouse: { pf: 100, gp: 0 },
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
        qtyByWarehouse: { pf: 0, gp: 0 },
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
        qtyByWarehouse: { pf: 0, gp: 0 },
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
        qtyByWarehouse: { s44: 40, sky: 0 },
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
        qtyByWarehouse: { s44: 0, sky: 0 },
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
  assert.equal(bySku.get("A")?.canAssembleRemaining, 100);
  assert.equal(bySku.get("A")?.toPack, 80);
  assert.equal(bySku.get("A")?.toProduce, 0);
  assert.equal(bySku.get("A")?.tone, "pack");
  assert.equal(bySku.get("A")?.toPackWarehouseId, KIT_BOARD_PACK_POOL_ID);
  assert.equal(bySku.get("A")?.canAssembleWarehouseId, KIT_BOARD_PACK_POOL_ID);
  assert.equal(bySku.get("A")?.paretoClass, "A");
  assert.equal(bySku.get("A")?.qtyStockTotal, 0);

  assert.equal(bySku.get("B")?.canAssemble, 100);
  assert.equal(bySku.get("B")?.canAssembleRemaining, 20);
  assert.equal(bySku.get("B")?.toPack, 20);
  assert.equal(bySku.get("B")?.toProduce, 30);
  assert.equal(bySku.get("B")?.tone, "pack");

  assert.equal(bySku.get("OK")?.qtyStockTotal, 40);

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
    qtyByWarehouse: { pf: 8, gp: 0 },
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
        qtyByWarehouse: { s44: 4 },
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
  assert.equal(rows[0]?.qtyStockTotal, 4);
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
    qtyByWarehouse: { pf: 50, gp: 0 },
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
        qtyByWarehouse: { s44: 40 },
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
  assert.equal(rows[0]?.qtyStockTotal, 40);
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
    qtyByWarehouse: { pf: 500 },
  };
  const low = {
    productId: "low",
    sku: "LOW",
    name: "Low",
    qtyPerKit: 1,
    scrapPct: 0,
    constrains: true,
    qtyByWarehouse: { pf: 100 },
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
        qtyByWarehouse: { pf: 0 },
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

test("kit stock is 44+Suprex; pack is 39/40 ABM only; DMT excluded", () => {
  assert.equal(isPackRecommendationWarehouse("39 ABM Склад Напівфабрикатів"), true);
  assert.equal(isPackRecommendationWarehouse("40 ABM Склад Готової продукції"), true);
  assert.equal(isPackRecommendationWarehouse("39 ДМТ Склад Напівфабрикатів"), false);
  assert.equal(isPackRecommendationWarehouse("40 ДМТ Склад Готової продукції"), false);
  assert.equal(
    isPackRecommendationWarehouse("40 ГП  (на проверку ОТК) - виртуальный"),
    false,
  );
  assert.equal(isPackRecommendationWarehouse("12 Склад Suprex"), false);
  assert.equal(isPackRecommendationWarehouse("44 Склад Готової продукції (СУПРЕКС)"), false);

  assert.equal(isKitStockWarehouse("44 Склад Готової продукції (СУПРЕКС)"), true);
  assert.equal(isKitStockWarehouse("Склад Suprex Киев"), true);
  assert.equal(isKitStockWarehouse("12 Склад Suprex"), false);
  assert.equal(isKitStockWarehouse("40 ABM Склад Готової продукції"), false);
  assert.equal(isKitStockWarehouse("40 ДМТ Склад Готової продукції"), false);

  const part = {
    productId: "bolt",
    sku: "BOLT",
    name: "Bolt",
    qtyPerKit: 1,
    scrapPct: 0,
    constrains: true,
    qtyByWarehouse: {
      pf: 0,
      gp: 0,
      dmt: 100,
    },
  };
  const rows = buildKitBoard({
    coverMonths: 1,
    monthKeys,
    warehouses: [
      ...warehouses,
      { id: "dmt", name: "40 ДМТ Склад Готової продукції" },
    ],
    kits: [
      {
        productId: "kit",
        sku: "K3",
        name: "Kit",
        // no kits on 44/Suprex → need = sales; DMT parts do not allow pack
        qtyByWarehouse: { s44: 0, sky: 0, dmt: 50 },
        avgMonthlySold: 10,
        revenue: 1000,
        monthlySold: flatMonthly(10),
        system: "Straumann RC",
        category: "Абатмент",
        parts: [part],
      },
    ],
  });
  assert.equal(rows[0]?.qtyStockTotal, 0);
  assert.equal(rows[0]?.need, 10);
  assert.equal(rows[0]?.canAssemble, 0);
  assert.equal(rows[0]?.toPack, 0);
  assert.equal(rows[0]?.toProduce, 10);
});

test("kit stock on Suprex closes sales cover; pack still needs ABM parts", () => {
  const part = {
    productId: "bolt",
    sku: "BOLT",
    name: "Bolt",
    qtyPerKit: 1,
    scrapPct: 0,
    constrains: true,
    qtyByWarehouse: { pf: 5, gp: 0 },
  };
  const rows = buildKitBoard({
    coverMonths: 1,
    monthKeys,
    warehouses,
    kits: [
      {
        productId: "kit",
        sku: "K4",
        name: "Kit",
        qtyByWarehouse: { sky: 3, s44: 2 },
        avgMonthlySold: 10,
        revenue: 1000,
        monthlySold: flatMonthly(10),
        system: "Straumann RC",
        category: "Абатмент",
        parts: [part],
      },
    ],
  });
  // stock 5 on Suprex/44 → need = 10-5 = 5; pack min(5,5)=5
  assert.equal(rows[0]?.qtyStockTotal, 5);
  assert.equal(rows[0]?.need, 5);
  assert.equal(rows[0]?.canAssemble, 5);
  assert.equal(rows[0]?.toPack, 5);
  assert.equal(rows[0]?.toProduce, 0);
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
        qtyByWarehouse: { pf: 10 },
      },
    ],
    "pf",
  );
  assert.equal(n, 3);
});

test("08.042-style split across 39/40 packs from the pool", () => {
  // Sales 547 / 3 mo, kit leftover 25 → need 522; pool min(2120, 232) → pack 232, produce 290.
  const rows = buildKitBoard({
    coverMonths: 3,
    monthKeys,
    warehouses,
    kits: [
      {
        productId: "kit-08042",
        sku: "08.042",
        name: "ND-SF-TB kit",
        qtyByWarehouse: { s44: 25 },
        avgMonthlySold: 547 / 3,
        revenue: 5000,
        monthlySold: flatMonthly(547 / 3),
        system: "NeoDent",
        category: "Абатмент",
        parts: [
          {
            productId: "nd-sf-tb",
            sku: "ND-SF-TB",
            name: "ND-SF-TB",
            qtyPerKit: 1,
            scrapPct: 0,
            constrains: true,
            qtyByWarehouse: { pf: 2120, gp: 0 },
          },
          {
            productId: "nd-tb",
            sku: "ND-TB-2.5x3.5mm",
            name: "ND-TB-2.5x3.5mm",
            qtyPerKit: 1,
            scrapPct: 0,
            constrains: true,
            qtyByWarehouse: { pf: 30, gp: 202 },
          },
        ],
      },
    ],
  });

  assert.equal(rows[0]?.need, 522);
  assert.equal(rows[0]?.canAssemble, 232);
  assert.equal(rows[0]?.toPack, 232);
  assert.equal(rows[0]?.toProduce, 290);
  assert.equal(rows[0]?.toPackWarehouseId, KIT_BOARD_PACK_POOL_ID);
});

test("alreadyInRequest reduces need/toPack and frees shared pool parts", () => {
  const shared = {
    productId: "shared",
    sku: "SHARED",
    name: "Shared",
    qtyPerKit: 1,
    scrapPct: 0,
    constrains: true,
    qtyByWarehouse: { pf: 100, gp: 0 },
  };
  const rows = buildKitBoard({
    coverMonths: 1,
    monthKeys,
    warehouses,
    alreadyInRequestByKit: { "kit-hi": 60 },
    kits: [
      {
        productId: "kit-hi",
        sku: "HI",
        name: "High need",
        qtyByWarehouse: { s44: 0 },
        avgMonthlySold: 80,
        revenue: 8000,
        monthlySold: flatMonthly(80),
        system: "NeoDent",
        category: "Абатмент",
        parts: [shared],
      },
      {
        productId: "kit-lo",
        sku: "LO",
        name: "Low need",
        qtyByWarehouse: { s44: 0 },
        avgMonthlySold: 50,
        revenue: 500,
        monthlySold: flatMonthly(50),
        system: "NeoDent",
        category: "Абатмент",
        parts: [shared],
      },
    ],
  });

  const bySku = new Map(rows.map((row) => [row.sku, row]));
  // Pool 100: reserve 60 for HI already-in-request, HI packs +20, LO gets 20.
  assert.equal(bySku.get("HI")?.alreadyInRequest, 60);
  assert.equal(bySku.get("HI")?.need, 20);
  assert.equal(bySku.get("HI")?.toPack, 20);
  assert.equal(bySku.get("HI")?.toProduce, 0);
  assert.equal(bySku.get("LO")?.toPack, 20);
  assert.equal(bySku.get("LO")?.toProduce, 30);
});

test("pack pool gives a shared split part to the larger need first", () => {
  const shared = {
    productId: "shared",
    sku: "SHARED",
    name: "Shared",
    qtyPerKit: 1,
    scrapPct: 0,
    constrains: true,
    qtyByWarehouse: { pf: 40, gp: 60 },
  };
  const other = {
    productId: "other",
    sku: "OTHER",
    name: "Other",
    qtyPerKit: 1,
    scrapPct: 0,
    constrains: true,
    qtyByWarehouse: { pf: 200, gp: 0 },
  };
  const rows = buildKitBoard({
    coverMonths: 1,
    monthKeys,
    warehouses,
    kits: [
      {
        productId: "kit-hi",
        sku: "HI",
        name: "High need",
        qtyByWarehouse: { s44: 0 },
        avgMonthlySold: 80,
        revenue: 8000,
        monthlySold: flatMonthly(80),
        system: "NeoDent",
        category: "Абатмент",
        parts: [shared, other],
      },
      {
        productId: "kit-lo",
        sku: "LO",
        name: "Low need",
        qtyByWarehouse: { s44: 0 },
        avgMonthlySold: 50,
        revenue: 500,
        monthlySold: flatMonthly(50),
        system: "NeoDent",
        category: "Абатмент",
        parts: [shared, other],
      },
    ],
  });

  const bySku = new Map(rows.map((row) => [row.sku, row]));
  // Pool can assemble min(100, 200) = 100; HI takes 80, LO gets 20.
  assert.equal(bySku.get("HI")?.toPack, 80);
  assert.equal(bySku.get("HI")?.toProduce, 0);
  assert.equal(bySku.get("LO")?.canAssembleRemaining, 20);
  assert.equal(bySku.get("LO")?.toPack, 20);
  assert.equal(bySku.get("LO")?.toProduce, 30);
});
