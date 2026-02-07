import { OrderStatus } from "@prisma/client";

export class UpdateOrderStatusDto {
  status!: OrderStatus;
  reason?: string;
}
