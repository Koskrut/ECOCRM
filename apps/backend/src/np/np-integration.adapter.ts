import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import {
  IntegrationPortsService,
  type StoreNpDirectoryCityQuery,
  type StoreNpDirectoryStreetQuery,
  type StoreNpDirectoryWarehouseQuery,
} from "../integration-ports/integration-ports.service";
import { NpSyncService } from "./np-sync.service";

@Injectable()
export class NpIntegrationAdapter implements OnModuleInit {
  constructor(
    @Inject(IntegrationPortsService) private readonly ports: IntegrationPortsService,
    @Inject(NpSyncService) private readonly npSync: NpSyncService,
  ) {}

  onModuleInit(): void {
    this.ports.registerStoreNpDirectory(this);
  }

  searchCities(query: StoreNpDirectoryCityQuery) {
    return this.npSync.searchCities(query);
  }

  searchWarehouses(query: StoreNpDirectoryWarehouseQuery) {
    return this.npSync.searchWarehouses(query);
  }

  searchStreets(query: StoreNpDirectoryStreetQuery) {
    return this.npSync.searchStreets(query);
  }
}
