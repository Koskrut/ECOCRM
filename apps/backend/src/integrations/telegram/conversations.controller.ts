import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../../auth/auth.types";
import { Roles } from "../../auth/roles.decorator";
import { ConversationsService } from "./conversations.service";
import { AssignConversationDto } from "./dto/assign-conversation.dto";
import { LinkContactDto } from "./dto/link-contact.dto";
import { ListConversationsQueryDto } from "./dto/list-conversations-query.dto";
import { ListMessagesQueryDto } from "./dto/list-messages-query.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { UpdateConversationStatusDto } from "./dto/update-conversation-status.dto";
import { RequireModule } from "../../modules/gating/require-module.decorator";
import { ModuleIds } from "../../modules/module-ids";

void AssignConversationDto;
void LinkContactDto;
void ListConversationsQueryDto;
void ListMessagesQueryDto;
void SendMessageDto;
void UpdateConversationStatusDto;

@Controller("conversations")
@Roles(UserRole.MANAGER, UserRole.LEAD, UserRole.ADMIN)
@RequireModule(ModuleIds.IntegrationsTelegram)
export class ConversationsController {
  constructor(@Inject(ConversationsService) private readonly conversations: ConversationsService) {}

  @Get()
  list(@Query() q: ListConversationsQueryDto, @Req() req: Request & { user?: AuthUser }) {
    return this.conversations.list(q, req.user);
  }

  @Get("unread-count")
  unreadCount(@Req() req: Request & { user?: AuthUser }) {
    return this.conversations.unreadCount(req.user);
  }

  @Get(":id/suggest-replies")
  suggestReplies(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
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

  @Patch(":id/assign")
  assign(
    @Param("id") id: string,
    @Body() dto: AssignConversationDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.conversations.assign(id, dto.userId ?? null, req.user);
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
  createContactFromLead(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.conversations.createContactFromLead(id, req.user);
  }
}
