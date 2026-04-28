import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { IntegrationPortsService } from "../../integration-ports/integration-ports.service";
import { TelegramService } from "./telegram.service";

@Injectable()
export class TelegramIntegrationAdapter implements OnModuleInit {
  constructor(
    @Inject(IntegrationPortsService) private readonly ports: IntegrationPortsService,
    @Inject(TelegramService) private readonly telegram: TelegramService,
  ) {}

  onModuleInit(): void {
    this.ports.registerMessenger(this);
  }

  sendMessageToChat(chatId: string, text: string) {
    return this.telegram.sendMessageToChat(chatId, text);
  }
}
