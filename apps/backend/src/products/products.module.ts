import { Module } from "@nestjs/common";
import { ProductsController } from "./products.controller";
import { ProductStore } from "./product.store";

@Module({
  controllers: [ProductsController],
  providers: [ProductStore],
})
export class ProductsModule {}
