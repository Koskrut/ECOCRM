import { IsIn } from "class-validator";

export class SendOrderDocumentTelegramDto {
  @IsIn(["invoice", "waybill"])
  kind!: "invoice" | "waybill";

  @IsIn(["me", "client"])
  dest!: "me" | "client";
}
