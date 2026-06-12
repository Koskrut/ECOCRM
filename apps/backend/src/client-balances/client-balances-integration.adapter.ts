import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { IntegrationPortsService } from "../integration-ports/integration-ports.service";
import { ClientBalancesService } from "./client-balances.service";
import type { SettleReturnDto } from "./dto/settle-return.dto";
import type { AuthUser } from "../auth/auth.types";

@Injectable()
export class ClientBalancesIntegrationAdapter implements OnModuleInit {
  constructor(
    @Inject(IntegrationPortsService) private readonly ports: IntegrationPortsService,
    @Inject(ClientBalancesService) private readonly balances: ClientBalancesService,
  ) {}

  onModuleInit(): void {
    this.ports.registerClientBalance(this);
  }

  getReturnSettlementPreview(returnId: string, actor?: AuthUser) {
    return this.balances.getReturnSettlementPreview(returnId, actor);
  }

  settleReturn(returnId: string, dto: SettleReturnDto, actor?: AuthUser) {
    return this.balances.settleReturn(returnId, dto, actor);
  }
}
