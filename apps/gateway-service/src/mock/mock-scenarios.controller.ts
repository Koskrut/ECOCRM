import { Controller, Get, UseGuards } from "@nestjs/common";
import { BearerAuthGuard } from "../common/guards/bearer-auth.guard";

@Controller("v1/mock")
@UseGuards(BearerAuthGuard)
export class MockScenariosController {
  @Get("scenarios")
  list(): { outcomes: string[] } {
    return {
      outcomes: [
        "default",
        "no_answer",
        "price_issue",
        "competitor",
        "catalog_requested",
        "callback_requested",
        "do_not_call",
        "transferred",
      ],
    };
  }
}
