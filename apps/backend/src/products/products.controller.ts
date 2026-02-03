import { Controller, Get, Query } from "@nestjs/common";
import { normalizePagination } from "../common/pagination";
import { ProductStore } from "./product.store";

type ProductsQuery = {
  search?: string;
  page?: string;
  pageSize?: string;
};

@Controller("/products")
export class ProductsController {
  constructor(private readonly productStore: ProductStore) {}

  @Get()
  public async list(@Query() query: ProductsQuery) {
    const pagination = normalizePagination({
      page: query.page,
      pageSize: query.pageSize,
    });

    const { items, total } = await this.productStore.listActive(
      query.search,
      pagination,
    );

    return {
      items,
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }
}
