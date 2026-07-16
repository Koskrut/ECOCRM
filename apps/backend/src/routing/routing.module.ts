import { Module } from "@nestjs/common";
import { OsrmRoutingService } from "./osrm-routing.service";

@Module({
  providers: [OsrmRoutingService],
  exports: [OsrmRoutingService],
})
export class RoutingModule {}
