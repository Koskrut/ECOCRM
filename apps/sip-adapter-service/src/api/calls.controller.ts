import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { BearerAuthGuard } from "../common/guards/bearer-auth.guard";
import { CallsService } from "../calls/calls.service";
import { AttachMediaDto } from "./dto/attach-media.dto";

@Controller("v1/calls")
@UseGuards(BearerAuthGuard)
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Get(":callId/status")
  status(@Param("callId") callId: string) {
    return this.calls.getStatus(callId);
  }

  @Post(":callId/hangup")
  @HttpCode(200)
  hangup(@Param("callId") callId: string) {
    return this.calls.hangup(callId);
  }

  @Post(":callId/media")
  @HttpCode(200)
  media(@Param("callId") callId: string, @Body() body: AttachMediaDto) {
    return this.calls.attachMedia(callId, body);
  }
}
