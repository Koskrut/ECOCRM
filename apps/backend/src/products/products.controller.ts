import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { normalizePagination } from "../common/pagination";
import { ProductStore } from "./product.store";
import { StockUploadService } from "./stock-upload.service";

type ProductsQuery = {
  search?: string;
  page?: string;
  pageSize?: string;
  catalog?: string;
};

@Controller("/products")
export class ProductsController {
  constructor(
    private readonly productStore: ProductStore,
    private readonly stockUploadService: StockUploadService,
  ) {}

  @Delete(":id")
  public async delete(@Param("id") id: string): Promise<{ ok: boolean }> {
    const ok = await this.productStore.setInactive(id);
    if (!ok) throw new BadRequestException("Product not found");
    return { ok: true };
  }

  @Patch(":id")
  public async patch(
    @Param("id") id: string,
    @Body() body: { stock?: number },
  ): Promise<{ ok: boolean }> {
    if (body.stock !== undefined) {
      const ok = await this.productStore.updateStockById(id, body.stock);
      if (!ok) throw new BadRequestException("Product not found");
    }
    return { ok: true };
  }

  @Get()
  public async list(@Query() query: ProductsQuery) {
    const pagination = normalizePagination({
      page: query.page,
      pageSize: query.pageSize,
    });

    const useCatalog = query.catalog === "1" || query.catalog === "true";
    const { items, total } = useCatalog
      ? await this.productStore.listCatalog(query.search, pagination)
      : await this.productStore.listActive(query.search, pagination);

    return {
      items,
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  @Post("stock/upload")
  @UseInterceptors(FileInterceptor("file"))
  public async uploadStock(
    @UploadedFile() file: { buffer?: Buffer } | undefined,
  ): Promise<{ updated: number; created: number; notFound: string[] }> {
    // #region agent log
    const fileKeys = file ? Object.keys(file) : [];
    fetch("http://127.0.0.1:7242/ingest/58313e80-8970-4da9-b340-4c7a66d3124e", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "products.controller.ts:uploadStock",
        message: "Backend received upload request",
        data: {
          hypothesisId: "H2",
          hasFile: !!file,
          hasBuffer: !!(file as { buffer?: Buffer } | undefined)?.buffer,
          fileKeys,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    const buffer = file?.buffer;
    if (!buffer) {
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/58313e80-8970-4da9-b340-4c7a66d3124e", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: "products.controller.ts:uploadStock",
          message: "Throw: File is required",
          data: { hypothesisId: "H3" },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      throw new BadRequestException("File is required");
    }
    const entries = this.stockUploadService.parseExcelBuffer(buffer);
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/58313e80-8970-4da9-b340-4c7a66d3124e", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "products.controller.ts:uploadStock",
        message: "After parseExcelBuffer",
        data: { hypothesisId: "H4", entriesLength: entries.length },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    if (entries.length === 0) {
      throw new BadRequestException(
        "No rows with valid артикул column. Expected headers: Артикул (or sku), Остаток (or qty/quantity/stock)",
      );
    }
    return this.productStore.bulkUpdateStocks(entries);
  }
}
