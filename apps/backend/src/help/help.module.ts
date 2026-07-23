import { Module } from "@nestjs/common";
import { RbacModule } from "../rbac/rbac.module";
import { HelpController } from "./help.controller";
import { HelpService } from "./help.service";

@Module({
  imports: [RbacModule],
  controllers: [HelpController],
  providers: [HelpService],
  exports: [HelpService],
})
export class HelpModule {}
