import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { OrderSource } from "@prisma/client";
import { verifyJwt } from "../../auth/jwt";
import { effectivePaymentRequestStatus } from "../../payment-requests/payment-request-public.mapper";
import { PaymentRequestsService } from "../../payment-requests/payment-requests.service";
import { PrismaService } from "../../prisma/prisma.service";

const PAY_JWT_TYP = "store_order_pay";

type PayPayload = {
  typ?: string;
  orderId?: string;
  contactId?: string;
};

@Injectable()
export class StoreCheckoutPaymentLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentRequests: PaymentRequestsService,
  ) {}

  async createPaymentLink(token: string): Promise<{ publicToken: string; payPath: string }> {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET is not set");

    let payload: PayPayload;
    try {
      payload = verifyJwt<PayPayload>(token, secret);
    } catch {
      throw new UnauthorizedException("Недійсне або прострочене посилання на оплату");
    }

    if (payload.typ !== PAY_JWT_TYP || !payload.orderId?.trim() || !payload.contactId?.trim()) {
      throw new UnauthorizedException("Недійсне посилання на оплату");
    }

    const orderId = payload.orderId.trim();
    const contactId = payload.contactId.trim();

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        orderSource: true,
        clientId: true,
        contactId: true,
        debtAmount: true,
        currency: true,
        exchangeRate: true,
      },
    });

    if (!order) throw new BadRequestException("Замовлення не знайдено");

    if (order.orderSource !== OrderSource.STORE) {
      throw new ForbiddenException();
    }

    if (order.clientId !== contactId && order.contactId !== contactId) {
      throw new ForbiddenException();
    }

    const debt = Number(order.debtAmount);
    if (!Number.isFinite(debt) || debt <= 0.00001) {
      throw new BadRequestException("За цим замовленням немає суми до сплати");
    }

    const now = new Date();
    const existing = await this.prisma.paymentRequest.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: "desc" },
    });
    for (const row of existing) {
      if (effectivePaymentRequestStatus(row, now) === "PENDING") {
        return { publicToken: row.publicToken, payPath: `/pay/${row.publicToken}` };
      }
    }

    const orderCurrency = (order.currency || "UAH").trim().toUpperCase();
    let amount: number;
    if (orderCurrency === "USD" || orderCurrency === "EUR") {
      const rate = order.exchangeRate != null && order.exchangeRate > 0 ? order.exchangeRate : null;
      if (!rate) {
        throw new BadRequestException("Для замовлення не задано курс гривні — зверніться до менеджера");
      }
      amount = Math.round(debt * rate * 100) / 100;
    } else {
      amount = Math.round(debt * 100) / 100;
    }

    if (amount <= 0) {
      throw new BadRequestException("Сума до сплати має бути більшою за 0");
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    expiresAt.setHours(23, 59, 59, 999);

    const purpose = `Оплата замовлення ${order.orderNumber}`;

    const created = await this.paymentRequests.create(
      order.id,
      {
        amount,
        purpose,
        expiresAt: expiresAt.toISOString(),
      },
      undefined,
    );

    return { publicToken: created.publicToken, payPath: `/pay/${created.publicToken}` };
  }
}
