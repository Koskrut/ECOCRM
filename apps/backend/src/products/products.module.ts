import { Module } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "../common/prisma";
import { ProductStore } from "./product.store";
import { ProductsController } from "./products.controller";

@Module({
  controllers: [ProductsController],
  providers: [
    ProductStore,
    {
      provide: PrismaClient,
      useFactory: createPrismaClient,
    },
  ],
})
export class ProductsModule {}
