import { Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { IdentityService } from "./identity.service";
import type { AuthenticatedRequest } from "src/common/auth/authenticated-request";
import { AnonymousIdentityGuard } from "src/common/auth/anonymous-identity.guard";




@Controller('identity')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) { }
  @Post()
  createIdentity() {
    return this.identityService.createIdentity();
  }


  @Get('me')
  @UseGuards(AnonymousIdentityGuard)
  getIdentity(@Req() request: AuthenticatedRequest) {
    return {
      identityId: request.identity.id
    }
  }
}
