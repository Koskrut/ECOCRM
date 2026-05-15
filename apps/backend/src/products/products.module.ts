import { Module } from "@nestjs/common";
import { SettingsServiceModule } from "../settings/settings-service.module";
import { WarehousesModule } from "../warehouses/warehouses.module";
import { WorkflowsModule } from "../workflows/workflows.module";
import { ProductsController } from "./products.controller";
import { ProductStore } from "./product.store";
import { ProductImageStore } from "./product-image.store";
import { ProductImagesSyncService } from "./product-images-sync.service";
import { ProductImagesSyncState } from "./product-images-sync-state";
import { StockUploadService } from "./stock-upload.service";

@Module({
  imports: [WarehousesModule, WorkflowsModule, SettingsServiceModule],
  controllers: [ProductsController],
  providers: [
    ProductStore,
    ProductImageStore,
    ProductImagesSyncService,
    ProductImagesSyncState,
    StockUploadService,
  ],
  exports: [ProductStore, ProductImageStore],
})
export class ProductsModule {}
