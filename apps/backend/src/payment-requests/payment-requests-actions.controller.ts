import { Controller, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { Roles } from "../auth/roles.decorator";
import { RequireModule } from "../modules/gating/require-module.decorator";
import { ModuleIds } from "../modules/module-ids";
import { PaymentRequestsService } from "./payment-requests.service";

@Controller("payment-requests")
@RequireModule(ModuleIds.Finance)
export class PaymentRequestsActionsController {
  constructor(private readonly paymentRequests: PaymentRequestsService) {}

  @Post(":id/cancel")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  cancel(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.paymentRequests.cancel(id, req.user);
  }

  @Post(":id/mark-paid")
  @Roles(UserRole.ADMIN)
  markPaid(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.paymentRequests.markPaid(id, req.user);
  }
}
