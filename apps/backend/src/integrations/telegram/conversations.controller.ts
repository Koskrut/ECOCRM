import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import type { AuthUser } from "../../auth/auth.types";
import { ConversationsService } from "./conversations.service";
import { LinkContactDto } from "./dto/link-contact.dto";
import { ListConversationsQueryDto } from "./dto/list-conversations-query.dto";
import { ListMessagesQueryDto } from "./dto/list-messages-query.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { UpdateConversationStatusDto } from "./dto/update-conversation-status.dto";

@Controller("conversations")
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  list(
    @Query() q: ListConversationsQueryDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.conversations.list(q, req.user);
  }

  @Get(":id/suggest-replies")
  suggestReplies(
    @Param("id") id: string,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.conversations.suggestReplies(id, req.user);
  }

  @Get(":id/messages")
  getMessages(
    @Param("id") id: string,
    @Query() q: ListMessagesQueryDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.conversations.getMessages(id, q, req.user);
  }

  @Patch(":id")
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateConversationStatusDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.conversations.updateStatus(id, dto.status, req.user);
  }

  @Post(":id/messages")
  sendMessage(
    @Param("id") id: string,
    @Body() dto: SendMessageDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.conversations.sendMessage(id, dto.text, req.user);
  }

  @Post(":id/link-contact")
  linkContact(
    @Param("id") id: string,
    @Body() dto: LinkContactDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.conversations.linkContact(id, dto.contactId, req.user);
  }

  @Post(":id/create-contact")
  createContactFromLead(
    @Param("id") id: string,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.conversations.createContactFromLead(id, req.user);
  }
}
