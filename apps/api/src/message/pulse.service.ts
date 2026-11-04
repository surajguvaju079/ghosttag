import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from 'generated/prisma/client';
import { MessageService } from './message.service';
import { pulseChoices, todayCatalog } from './playground.catalog';

type StoredPulse = Prisma.PollGetPayload<{ include: { votes: true } }>;

@Injectable()
export class PulseService {
  constructor(private readonly messages: MessageService) {}

  today() {
    return todayCatalog();
  }

  private publicPulse(
    poll: StoredPulse,
    membershipId: string,
    code: string,
    now = new Date(),
  ) {
    const mine =
      poll.votes.find((vote) => vote.membershipId === membershipId)?.option ??
      null;
    const ended = poll.expiresAt <= now;
    return {
      code,
      pulseId: poll.publicId,
      question: poll.question,
      optionA: poll.optionA,
      optionB: poll.optionB,
      createdAt: poll.createdAt,
      expiresAt: poll.expiresAt,
      myVote: mine,
      results:
        mine || ended
          ? {
              A: poll.votes.filter((vote) => vote.option === 'A').length,
              B: poll.votes.filter((vote) => vote.option === 'B').length,
            }
          : null,
    };
  }

  list(hash: string, code: string) {
    return this.messages.access(
      hash,
      code,
      async ({ tx, room, membership }) => {
        const polls = await tx.poll.findMany({
          where: { roomId: room.id, promptId: { not: null } },
          orderBy: [{ createdAt: 'desc' }, { publicId: 'desc' }],
          take: 10,
          include: { votes: true },
        });
        return {
          pulses: polls.map((poll) =>
            this.publicPulse(poll, membership.id, room.code),
          ),
        };
      },
    );
  }

  start(hash: string, code: string, body: unknown) {
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      typeof (body as { promptId?: unknown }).promptId !== 'string'
    )
      throw new BadRequestException({
        code: 'INVALID_PULSE',
        message: 'Choose a Pulse question.',
      });
    const choice = pulseChoices.find(
      (item) => item.id === (body as { promptId: string }).promptId,
    );
    if (!choice)
      throw new BadRequestException({
        code: 'INVALID_PULSE',
        message: 'Choose a Pulse question.',
      });
    return this.messages.access(
      hash,
      code,
      async ({ tx, room, membership }) => {
        const now = new Date();
        const active = await tx.poll.findFirst({
          where: {
            roomId: room.id,
            promptId: { not: null },
            expiresAt: { gt: now },
          },
          include: { votes: true },
        });
        if (active) {
          if (active.promptId === choice.id)
            return {
              pulse: this.publicPulse(active, membership.id, room.code, now),
              created: false,
            };
          throw new ConflictException({
            code: 'PULSE_ACTIVE',
            message: 'A Pulse is already active.',
          });
        }
        const total = await tx.poll.count({
          where: { roomId: room.id, promptId: { not: null } },
        });
        if (total >= 10)
          throw new ConflictException({
            code: 'PULSE_LIMIT',
            message: 'This room has reached its Pulse limit.',
          });
        const created = await tx.poll.create({
          data: {
            roomId: room.id,
            promptId: choice.id,
            question: choice.question,
            optionA: choice.optionA,
            optionB: choice.optionB,
            expiresAt: new Date(
              Math.min(now.getTime() + 300_000, room.expiresAt.getTime()),
            ),
          },
          include: { votes: true },
        });
        return {
          pulse: this.publicPulse(created, membership.id, room.code, now),
          created: true,
        };
      },
      true,
    );
  }

  vote(hash: string, code: string, pulseId: string, body: unknown) {
    if (
      !/^u_[a-f0-9]{32}$/.test(pulseId) ||
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      !['A', 'B'].includes((body as { option?: unknown }).option as string)
    )
      throw new BadRequestException({
        code: 'INVALID_PULSE_VOTE',
        message: 'Choose one Pulse option.',
      });
    const option = (body as { option: 'A' | 'B' }).option;
    return this.messages.access(
      hash,
      code,
      async ({ tx, room, membership }) => {
        const poll = await tx.poll.findUnique({
          where: { publicId: pulseId },
          include: { votes: true },
        });
        if (!poll || poll.roomId !== room.id || !poll.promptId)
          throw new NotFoundException({
            code: 'PULSE_NOT_FOUND',
            message: 'Pulse not found.',
          });
        if (poll.expiresAt <= new Date())
          throw new GoneException({
            code: 'PULSE_EXPIRED',
            message: 'This Pulse has ended.',
          });
        const previous = poll.votes.find(
          (vote) => vote.membershipId === membership.id,
        );
        if (previous && previous.option !== option)
          throw new ConflictException({
            code: 'PULSE_ALREADY_VOTED',
            message: 'Your vote is already recorded.',
          });
        if (!previous)
          await tx.pollVote.create({
            data: { pollId: poll.id, membershipId: membership.id, option },
          });
        const updated = await tx.poll.findUniqueOrThrow({
          where: { id: poll.id },
          include: { votes: true },
        });
        return {
          pulse: this.publicPulse(updated, membership.id, room.code),
          recorded: !previous,
        };
      },
      true,
    );
  }
}
