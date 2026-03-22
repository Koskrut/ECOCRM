import { Module } from "@nestjs/common";
import { BankModule } from "../bank/bank.module";
import { ContactsModule } from "../contacts/contacts.module";
import { NpModule } from "../np/np.module";
import { OrdersModule } from "../orders/orders.module";
import { PaymentRequestsModule } from "../payment-requests/payment-requests.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ProductsModule } from "../products/products.module";
import { SettingsModule } from "../settings/settings.module";
import { StoreAuthModule } from "./auth/store-auth.module";
import { StoreCabinetController } from "./cabinet/store-cabinet.controller";
import { StoreCustomerController } from "./customer/store-customer.controller";
import { StoreCabinetService } from "./cabinet/store-cabinet.service";
import { StoreCartController } from "./cart/store-cart.controller";
import { StoreCartService } from "./cart/store-cart.service";
import { StoreCatalogController } from "./catalog/store-catalog.controller";
import { StoreCheckoutController } from "./checkout/store-checkout.controller";
import { StoreCheckoutPaymentLinkService } from "./checkout/store-checkout-payment-link.service";
import { StoreCheckoutService } from "./checkout/store-checkout.service";
import { StoreNpController } from "./np/store-np.controller";
import { StoreConfigController } from "./store-config.controller";
import { StoreTelegramLinkService } from "./telegram/store-telegram-link.service";

@Module({
  imports: [
    PrismaModule,
    SettingsModule,
    StoreAuthModule,
    BankModule,
    ContactsModule,
    ProductsModule,
    OrdersModule,
    NpModule,
    PaymentRequestsModule,
  ],
  controllers: [
    StoreConfigController,
    StoreCatalogController,
    StoreCartController,
    StoreCheckoutController,
    StoreCabinetController,
    StoreCustomerController,
    StoreNpController,
  ],
  providers: [
    StoreCartService,
    StoreCheckoutService,
    StoreCheckoutPaymentLinkService,
    StoreCabinetService,
    StoreTelegramLinkService,
  ],
})
export class StoreModule {}
