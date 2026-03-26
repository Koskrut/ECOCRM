import { Controller, Get, NotFoundException, Param, UseGuards } from "@nestjs/common";
import { BearerAuthGuard } from "../common/guards/bearer-auth.guard";
import { SessionRegistryService } from "../sessions/session-registry.service";
import { Inject } from "@nestjs/common";
import type { SessionStore } from "../storage/session-store.interface";

@Controller("v1/sessions")
@UseGuards(BearerAuthGuard)
export class SessionsController {
  constructor(
    private readonly registry: SessionRegistryService,
    @Inject("SessionStore") private readonly store: SessionStore,
  ) {}

  @Get(":id")
  getOne(@Param("id") id: string) {
    const s = this.registry.get(id);
    if (!s) throw new NotFoundException("session not found");
    return s;
  }

  @Get(":id/events")
  events(@Param("id") id: string) {
    if (!this.registry.get(id)) throw new NotFoundException("session not found");
    return this.store.listEvents(id);
  }
}
