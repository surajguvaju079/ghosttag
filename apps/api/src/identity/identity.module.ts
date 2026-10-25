import { IdentityCredentialService } from 'src/common/auth/identity-credential.service';
import { Module } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { IdentityController } from './identity.controller';
import { AnonymousIdentityGuard } from 'src/common/auth/anonymous-identity.guard';

@Module({
  controllers: [IdentityController],
  providers: [
    IdentityService,
    AnonymousIdentityGuard,
    IdentityCredentialService,
  ],
  exports: [IdentityService, AnonymousIdentityGuard, IdentityCredentialService],
})
export class IdentityModule {}
