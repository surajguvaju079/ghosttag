import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from 'generated/prisma/client';
import { IdentityCredentialService } from 'src/common/auth/identity-credential.service';
import { AgeEligibilityService } from 'src/identity/age-eligibility.service';
import { RoomService } from 'src/room/room.service';
import { MatchingRepository } from './matching.repository';

@Injectable()
export class MatchingService {
  constructor(
    private readonly repository: MatchingRepository,
    private readonly credentials: IdentityCredentialService,
    private readonly eligibility: AgeEligibilityService,
    private readonly rooms: RoomService,
    private readonly config: ConfigService,
  ) {}
  private get enabled() {
    return this.config.get<unknown>('MATCHING_ENABLED') === 'true';
  }
  private access<T>(
    hash: string,
    action: (tx: Prisma.TransactionClient, userId: string) => Promise<T>,
  ) {
    return this.repository.transaction(async (tx) => {
      const credential = await this.credentials.verify(hash, tx);
      await this.eligibility.assertAccess(credential.userId, tx);
      await this.repository.pruneOwn(tx, credential.userId);
      return action(tx, credential.userId);
    });
  }
  private async snapshot(tx: Prisma.TransactionClient, userId: string) {
    const session = await this.repository.activeSession(tx, userId);
    const search = await this.repository.search(tx, userId);
    return {
      status: session
        ? ('MATCHED' as const)
        : search &&
            search.expiresAt.getTime() > Date.now() &&
            search.leaseUntil.getTime() > Date.now()
          ? ('WAITING' as const)
          : ('IDLE' as const),
      matchingEnabled: this.enabled,
      blockedCount: await this.repository.blockCount(tx, userId),
      session: session
        ? {
            id: session.publicId,
            code: session.room.code,
            topic: session.topic,
            expiresAt: session.room.expiresAt.toISOString(),
            extended: session.extended,
            extensionRequested:
              session.userAId === userId ? session.voteA : session.voteB,
            partnerRequested:
              session.userAId === userId ? session.voteB : session.voteA,
          }
        : null,
      search:
        !session &&
        search &&
        search.expiresAt.getTime() > Date.now() &&
        search.leaseUntil.getTime() > Date.now()
          ? {
              id: search.publicId,
              topic: search.topic,
              expiresAt: search.expiresAt.toISOString(),
              leaseUntil: search.leaseUntil.toISOString(),
            }
          : null,
    };
  }
  state(hash: string) {
    return this.access(hash, (tx, userId) => this.snapshot(tx, userId));
  }
  start(hash: string, body: unknown) {
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      !Object.keys(body).every((key) => ['language', 'topic'].includes(key)) ||
      !('language' in body) ||
      body.language !== 'en' ||
      ('topic' in body &&
        (typeof body.topic !== 'string' ||
          !['open', 'music', 'games', 'deep-talk'].includes(body.topic)))
    )
      throw new BadRequestException({
        code: 'INVALID_MATCH_SEARCH',
        message: 'Choose English for casual conversation.',
      });
    return this.access(hash, async (tx, userId) => {
      if (!this.enabled)
        throw new ServiceUnavailableException({
          code: 'MATCHING_DISABLED',
          message: 'Finding company is not available yet.',
        });
      const current = await this.snapshot(tx, userId);
      if (current.status === 'MATCHED') return current;
      if (!current.search)
        await this.repository.start(
          tx,
          userId,
          'topic' in body ? (body.topic as string) : 'open',
        );
      return this.tryPair(tx, userId);
    });
  }
  heartbeat(hash: string, id: string) {
    this.searchId(id);
    return this.access(hash, async (tx, userId) => {
      const current = await this.snapshot(tx, userId);
      if (
        current.status !== 'WAITING' ||
        current.search?.id !== id ||
        !this.enabled
      )
        return current;
      await this.repository.renew(
        tx,
        userId,
        new Date(current.search.expiresAt),
      );
      return this.tryPair(tx, userId);
    });
  }
  cancel(hash: string, id: string) {
    this.searchId(id);
    return this.access(hash, async (tx, userId) => {
      await this.repository.removeSearch(tx, userId, id);
      return this.snapshot(tx, userId);
    });
  }
  private async tryPair(tx: Prisma.TransactionClient, userId: string) {
    const search = await this.repository.search(tx, userId);
    if (!search) return this.snapshot(tx, userId);
    for (const candidate of await this.repository.candidates(
      tx,
      userId,
      search.topic,
    )) {
      if (await this.repository.blocked(tx, userId, candidate.userId)) continue;
      if (await this.repository.activeSession(tx, candidate.userId)) continue;
      const credential = await this.repository.credential(tx, candidate.userId);
      if (!credential) continue;
      try {
        await this.credentials.verify(credential.tokenHash, tx);
        await this.eligibility.assertAccess(candidate.userId, tx);
      } catch (error) {
        // Authorization failures exclude a candidate; infrastructure failures abort.
        if (
          error instanceof HttpException &&
          [401, 403].includes(error.getStatus())
        )
          continue;
        throw error;
      }
      const own = await this.repository.search(tx, userId);
      const now = Date.now();
      if (
        !own ||
        own.topic !== candidate.topic ||
        own.expiresAt.getTime() <= now ||
        own.leaseUntil.getTime() <= now
      )
        break;
      if (
        candidate.expiresAt.getTime() <= now ||
        candidate.leaseUntil.getTime() <= now
      )
        continue;
      await this.rooms.createMatchedRoom(
        tx,
        candidate.userId,
        userId,
        own.topic,
      );
      await this.repository.removeSearch(tx, userId);
      await this.repository.removeSearch(tx, candidate.userId);
      break;
    }
    return this.snapshot(tx, userId);
  }
  async action(hash: string, id: string, action: 'extend' | 'end' | 'block') {
    if (!/^c_[a-f0-9]{32}$/.test(id))
      throw new BadRequestException({
        code: 'INVALID_MATCH_SESSION',
        message: 'Invalid conversation.',
      });
    const result = await this.access(hash, async (tx, userId) => {
      const found = await this.repository.session(tx, id, userId);
      if (!found)
        throw new NotFoundException({
          code: 'MATCH_NOT_FOUND',
          message: 'Conversation not found.',
        });
      const session = await this.repository.lockSessionRoom(tx, found.roomId);
      let events: { userId: string; code: string }[] = [];
      if (action === 'extend') {
        this.rooms.assertAccessible(session.room);
        if (!session.extended) {
          const votes = await this.repository.vote(
            tx,
            session.roomId,
            session.userAId === userId,
          );
          // Recheck after locks/writes so votes cannot extend an already expired chat.
          this.rooms.assertAccessible(session.room);
          if (votes.voteA && votes.voteB)
            await this.repository.extend(
              tx,
              session.roomId,
              session.room.expiresAt,
            );
        }
      } else {
        if (action === 'block') {
          const otherId =
            session.userAId === userId ? session.userBId : session.userAId;
          await this.repository.block(tx, userId, otherId);
          events = (await this.rooms.separateForBlock(tx, userId, otherId))
            .events;
        } else {
          await this.rooms.closeMatchedRoom(tx, session.roomId);
          events = [
            { userId: session.userAId, code: session.room.code },
            { userId: session.userBId, code: session.room.code },
          ];
        }
      }
      return { state: await this.snapshot(tx, userId), events };
    });
    this.rooms.notifyLeaves(result.events);
    return result.state;
  }
  clearBlocks(hash: string) {
    return this.access(hash, async (tx, userId) => {
      await this.repository.clearBlocks(tx, userId);
      return this.snapshot(tx, userId);
    });
  }
  private searchId(id: string) {
    if (!/^s_[a-f0-9]{32}$/.test(id))
      throw new BadRequestException({
        code: 'INVALID_MATCH_SEARCH',
        message: 'Invalid search.',
      });
  }
}
