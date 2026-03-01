import { Module } from "@nestjs/common";
import { ProductsController } from "./products.controller";
import { ProductStore } from "./product.store";
import { StockUploadService } from "./stock-upload.service";

@Module({
  controllers: [ProductsController],
  providers: [ProductStore, StockUploadService],
})
export class ProductsModule {}
