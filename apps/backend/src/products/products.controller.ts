import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import type { Request } from "express";
import { Public } from "../auth/public.decorator";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { Prisma } from "@prisma/client";
import { getFileStream } from "./drive/google-drive.client";
import { normalizePagination } from "../common/pagination";
import { ProductStore } from "./product.store";
import { ProductImageStore } from "./product-image.store";
import { ProductImagesSyncService } from "./product-images-sync.service";
import { ProductImagesSyncState } from "./product-images-sync-state";
import type { ProductImagesSyncStatus } from "./product-images-sync-state";
import { StockUploadService } from "./stock-upload.service";
import type { ProductImagesSyncResult } from "./product-images-sync.service";
import { WarehousesService } from "../warehouses/warehouses.service";

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
    private readonly productImageStore: ProductImageStore,
    private readonly productImagesSyncService: ProductImagesSyncService,
    private readonly syncState: ProductImagesSyncState,
    private readonly stockUploadService: StockUploadService,
    private readonly warehousesService: WarehousesService,
  ) {}

  @Get()
  public async list(@Query() query: ProductsQuery) {
    const pagination = normalizePagination({
      page: query.page,
      pageSize: query.pageSize,
    });

    const useCatalog = query.catalog === "1" || query.catalog === "true";
    const { items, total } = useCatalog
      ? await this.productStore.listCatalog(query.search, pagination)
      : await this.productStore.listActive(query.search, undefined, pagination);

    return {
      items,
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  @Post()
  public async create(
    @Body() body: { sku?: string; name?: string; unit?: string; basePrice?: number; showOnStore?: boolean },
    @Req() req: Request & { body?: Record<string, unknown> },
  ) {
    const raw = req.body ?? {};
    const sku = (body?.sku ?? raw.sku)?.toString?.()?.trim();
    if (!sku) {
      throw new BadRequestException("Артикул обязателен");
    }
    const name = body?.name ?? raw.name;
    const unit = body?.unit ?? raw.unit;
    const basePrice = body?.basePrice ?? raw.basePrice;
    const showOnStore = body?.showOnStore ?? raw.showOnStore;
    return this.productStore.create({
      sku,
      name: name != null ? String(name).trim() || undefined : undefined,
      unit: unit != null ? String(unit).trim() : undefined,
      basePrice:
        basePrice !== undefined && basePrice !== null && !Number.isNaN(Number(basePrice))
          ? Math.max(0, Number(basePrice))
          : undefined,
      showOnStore:
        showOnStore !== undefined && showOnStore !== null ? Boolean(showOnStore) : undefined,
    });
  }

  @Post("images/sync")
  public syncProductImages(
    @Body() body: { folderId?: string },
  ): { jobId: string; status: string } {
    if (this.syncState.isRunning()) {
      throw new ConflictException(this.syncState.get());
    }
    const jobId = this.syncState.start();
    const folderId = body?.folderId?.trim() || undefined;
    void this.productImagesSyncService
      .syncFromGoogleDrive(folderId, (p) => this.syncState.setProgress(p))
      .then((result) => this.syncState.complete(result))
      .catch((err: unknown) =>
        this.syncState.fail(err instanceof Error ? err.message : "Sync failed"),
      );
    return { jobId, status: "started" };
  }

  @Get("images/sync/status")
  public getSyncStatus(): ProductImagesSyncStatus {
    return this.syncState.get();
  }

  @Post("stock/upload")
  @UseInterceptors(FileInterceptor("file"))
  public async uploadStock(
    @UploadedFile() file: { buffer?: Buffer } | undefined,
  ): Promise<{ updated: number; created: number; notFound: string[] }> {
    const buffer = file?.buffer;
    if (!buffer) {
      throw new BadRequestException("File is required");
    }
    const entries = this.stockUploadService.parseExcelBuffer(buffer);
    if (entries.length === 0) {
      throw new BadRequestException(
        "No rows with valid артикул column. Expected headers: Артикул (or sku), Остаток (or qty/quantity/stock)",
      );
    }
    const skuSet = new Set(entries.map((e) => e.sku.trim()).filter(Boolean));
    await this.productStore.resetStockExceptSkus(skuSet);
    return this.productStore.bulkUpdateStocks(entries);
  }

  @Post("stock/upload-by-warehouses")
  @UseInterceptors(FileInterceptor("file"))
  public async uploadStockByWarehouses(
    @UploadedFile() file: { buffer?: Buffer } | undefined,
  ): Promise<{ updated: number; created: number; notFound: string[] }> {
    const buffer = file?.buffer;
    if (!buffer) throw new BadRequestException("File is required");
    const warehouses = await this.warehousesService.list();
    if (warehouses.length === 0) {
      throw new BadRequestException("No warehouses configured. Add warehouses first.");
    }
    const entries = this.stockUploadService.parseExcelBufferByWarehouses(buffer, warehouses);
    if (entries.length === 0) {
      throw new BadRequestException(
        "No rows with valid артикул and warehouse columns. Expected: Артикул (or sku) + columns matching warehouse names (Днепр, Одесса, Львов).",
      );
    }
    return this.productStore.bulkSetStocksByWarehouses(entries);
  }

  @Public()
  @Get("images/:imageId/source")
  public async streamImageSource(
    @Param("imageId") imageId: string,
    @Res() res: Response,
  ): Promise<void> {
    const image = await this.productImageStore.findById(imageId);
    if (!image) {
      res.status(404).json({ message: "Image not found" });
      return;
    }
    if (image.source !== "google_drive") {
      res.status(400).json({ message: "Only google_drive images can be streamed" });
      return;
    }
    try {
      const { stream, mimeType } = await getFileStream(image.fileId);
      if (mimeType) res.setHeader("Content-Type", mimeType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      stream.pipe(res);
    } catch (err) {
      res.status(502).json({
        message: err instanceof Error ? err.message : "Failed to load image from Drive",
      });
    }
  }

  @Get(":id/images")
  public async listProductImages(@Param("id") id: string) {
    const product = await this.productStore.findById(id);
    if (!product) throw new BadRequestException("Product not found");
    const images = await this.productImageStore.findByProductId(id);
    return { items: images };
  }

  @Delete(":id")
  public async delete(@Param("id") id: string): Promise<{ ok: boolean }> {
    const ok = await this.productStore.setInactive(id);
    if (!ok) throw new BadRequestException("Product not found");
    return { ok: true };
  }

  @Patch(":id")
  public async patch(
    @Param("id") id: string,
    @Body()
    body: {
      stock?: number;
      showOnStore?: boolean;
      isActive?: boolean;
      /** JSON object of attribute_code → value, or null to clear. */
      characteristics?: unknown;
    },
  ): Promise<{ ok: boolean }> {
    if (body.stock !== undefined) {
      const ok = await this.productStore.updateStockById(id, body.stock);
      if (!ok) throw new BadRequestException("Product not found");
    }
    if (body.showOnStore !== undefined) {
      const ok = await this.productStore.updateShowOnStore(id, body.showOnStore);
      if (!ok) throw new BadRequestException("Product not found");
    }
    if (body.isActive !== undefined) {
      const ok = body.isActive
        ? await this.productStore.setActive(id)
        : await this.productStore.setInactive(id);
      if (!ok) throw new BadRequestException("Product not found");
    }
    if (body.characteristics !== undefined) {
      let payload: Prisma.InputJsonValue | null;
      if (body.characteristics === null) {
        payload = null;
      } else if (
        typeof body.characteristics === "object" &&
        body.characteristics !== null &&
        !Array.isArray(body.characteristics)
      ) {
        payload = body.characteristics as Prisma.InputJsonValue;
      } else {
        throw new BadRequestException("characteristics must be a JSON object or null");
      }
      const ok = await this.productStore.updateCharacteristics(id, payload);
      if (!ok) throw new BadRequestException("Product not found");
    }
    return { ok: true };
  }
}
