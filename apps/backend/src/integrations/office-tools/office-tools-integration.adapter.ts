import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { IntegrationPortsService } from "../../integration-ports/integration-ports.service";
import { OfficeToolsConfigService } from "./office-tools-config.service";
import { OfficeToolsOrderService } from "./office-tools-order.service";

@Injectable()
export class OfficeToolsIntegrationAdapter implements OnModuleInit {
  constructor(
    @Inject(IntegrationPortsService) private readonly ports: IntegrationPortsService,
    private readonly config: OfficeToolsConfigService,
    private readonly orders: OfficeToolsOrderService,
  ) {}

  onModuleInit(): void {
    this.ports.registerOfficeToolsOrderSender({
      isActive: () => this.config.isActive(),
      sendOrder: (orderId, options) => this.orders.sendOrder(orderId, options),
    });
  }
}
