import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common";
import { Public } from "../../auth/public.decorator";
import { RingostatIngestService } from "./ringostat-ingest.service";

const WEBHOOK_SECRET_HEADER = "x-ringostat-webhook-secret";

@Controller("integrations/ringostat")
export class RingostatController {
  constructor(private readonly ingest: RingostatIngestService) {}

  @Public()
  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Headers(WEBHOOK_SECRET_HEADER) secretToken: string | undefined,
    @Body() body: unknown,
  ): Promise<{ ok: true }> {
    await this.ingest.handleWebhook(body, secretToken);
    return { ok: true };
  }
}

