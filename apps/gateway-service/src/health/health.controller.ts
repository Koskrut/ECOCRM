import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  health(): { status: string; ts: string } {
    return { status: "ok", ts: new Date().toISOString() };
  }
}
