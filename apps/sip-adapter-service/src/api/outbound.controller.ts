import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { BearerAuthGuard } from "../common/guards/bearer-auth.guard";
import { CallsService } from "../calls/calls.service";
import { CreateOutboundDto } from "./dto/create-outbound.dto";

@Controller("v1/outbound")
@UseGuards(BearerAuthGuard)
export class OutboundController {
  constructor(private readonly calls: CallsService) {}

  @Post("calls")
  @HttpCode(201)
  create(@Body() body: CreateOutboundDto) {
    return this.calls.createOutbound({
      destination: body.destination,
      externalSessionId: body.externalSessionId,
      attemptId: body.attemptId,
    });
  }
}
