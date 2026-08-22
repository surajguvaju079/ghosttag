import { Module } from "@nestjs/common";
import { IdentityService } from "./identity.service";
import { IdentityController } from "./identity.controller";
import { AnonymousIdentityGuard } from "src/common/auth/anonymous-identity.guard";

@Module({
  controllers: [IdentityController],
  providers: [IdentityService, AnonymousIdentityGuard],
  exports: [IdentityService, AnonymousIdentityGuard]

})


export class IdentityModule { }
