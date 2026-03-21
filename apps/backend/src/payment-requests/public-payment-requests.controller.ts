import { Controller, Get, Param } from "@nestjs/common";
import { Public } from "../auth/public.decorator";
import { PaymentRequestsService } from "./payment-requests.service";

@Controller("public/payment-requests")
export class PublicPaymentRequestsController {
  constructor(private readonly paymentRequests: PaymentRequestsService) {}

  /** Публічний доступ за токеном (без JWT). */
  @Public()
  @Get("by-token/:token")
  getByToken(@Param("token") token: string) {
    return this.paymentRequests.getPublicByToken(token);
  }
}
