import { Body, Controller, Post } from "@nestjs/common";
import { CreateStoreLeadDto } from "./dto/create-store-lead.dto";
import { StoreLeadsService } from "./store-leads.service";

@Controller("store/leads")
export class StoreLeadsController {
  constructor(private readonly storeLeads: StoreLeadsService) {}

  @Post()
  create(@Body() dto: CreateStoreLeadDto) {
    return this.storeLeads.createLead(dto);
  }
}
