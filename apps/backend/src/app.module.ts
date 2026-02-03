import { Module } from "@nestjs/common";
import { CompaniesModule } from "./companies/companies.module";
import { ContactsModule } from "./contacts/contacts.module";
import { OrdersModule } from "./orders/orders.module";
import { ProductsModule } from "./products/products.module";

@Module({
  imports: [OrdersModule, ProductsModule, CompaniesModule, ContactsModule],
})
export class AppModule {}
