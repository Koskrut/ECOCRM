import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types";
import { IntegrationPortsService } from "../integration-ports/integration-ports.service";
import { PaymentsService } from "./payments.service";

@Injectable()
export class PaymentsIntegrationAdapter implements OnModuleInit {
  constructor(
    @Inject(IntegrationPortsService) private readonly ports: IntegrationPortsService,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
  ) {}

  onModuleInit(): void {
    this.ports.registerOrderPaymentsReader(this);
    this.ports.registerOrderFinance(this);
  }

  listByOrderId(orderId: string, actor?: AuthUser) {
    return this.payments.listByOrderId(orderId, actor);
  }

  recalcOrder(orderId: string) {
    return this.payments.recalcOrder(orderId);
  }
}
