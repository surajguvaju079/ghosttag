import { AgeEligibilityService } from './age-eligibility.service';
import { AgeEligibilityRepository } from './age-eligibility.repository';
import { SocialAccessGuard } from 'src/common/auth/social-access.guard';
import { IdentityCredentialService } from 'src/common/auth/identity-credential.service';
import { Module } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { IdentityController } from './identity.controller';
import { AnonymousIdentityGuard } from 'src/common/auth/anonymous-identity.guard';

@Module({
  controllers: [IdentityController],
  providers: [
    IdentityService,
    AgeEligibilityService,
    AgeEligibilityRepository,
    SocialAccessGuard,
    AnonymousIdentityGuard,
    IdentityCredentialService,
  ],
  exports: [
    IdentityService,
    AnonymousIdentityGuard,
    IdentityCredentialService,
    SocialAccessGuard,
    AgeEligibilityService,
  ],
})
export class IdentityModule {}
