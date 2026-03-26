import { Global, Module } from "@nestjs/common";
import { InMemorySessionStore } from "./in-memory-session.store";
import { InMemoryDeliveryLogStore } from "./in-memory-delivery-log.store";

@Global()
@Module({
  providers: [
    { provide: "SessionStore", useClass: InMemorySessionStore },
    { provide: "DeliveryLogStore", useClass: InMemoryDeliveryLogStore },
  ],
  exports: ["SessionStore", "DeliveryLogStore"],
})
export class StorageModule {}
