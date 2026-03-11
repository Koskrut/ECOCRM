import { Controller, Get, Query } from "@nestjs/common";
import { normalizePagination } from "../../common/pagination";
import { ProductStore } from "../../products/product.store";
import { SettingsService } from "../../settings/settings.service";

@Controller("store/products")
export class StoreCatalogController {
  constructor(
    private readonly productStore: ProductStore,
    private readonly settings: SettingsService,
  ) {}

  @Get()
  async list(
    @Query("search") search?: string,
    @Query("category") category?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const pagination = normalizePagination({
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 50,
    });
    const [rates, { items, total }] = await Promise.all([
      this.settings.getExchangeRates(),
      this.productStore.listActive(
        search?.trim() || undefined,
        category?.trim() || undefined,
        pagination,
      ),
    ]);
    const uahPerUsd = rates.UAH_TO_USD > 0 ? 1 / rates.UAH_TO_USD : 41;
    return {
      uahPerUsd,
      items: items.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        unit: p.unit,
        basePrice: p.basePrice,
        inStock: p.stock > 0,
        primaryImageUrl: p.primaryImageUrl ?? null,
        primaryImageId: p.primaryImageId ?? null,
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }
}
