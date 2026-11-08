import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RateLimitService } from 'src/safety/rate-limit.service';
import type { Prisma } from 'generated/prisma/client';
import { GameRepository, StoredGame } from './game.repository';
import { MessageService } from './message.service';

type Kind = 'RPS' | 'ANTAKSHARI';
type Choice = 'ROCK' | 'PAPER' | 'SCISSORS';
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const publicId = /^g_[0-9a-f]{32}$/;

function fields(body: unknown, names: string[]) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new BadRequestException({ code: 'INVALID_GAME_ACTION' });
  const value = body as Record<string, unknown>;
  if (
    Object.keys(value).length !== names.length ||
    names.some((name) => !(name in value))
  )
    throw new BadRequestException({ code: 'INVALID_GAME_ACTION' });
  return value;
}

function participant(member: {
  publicId: string;
  ghostName: string;
  ghostAvatar: string;
}) {
  return {
    participantId: member.publicId,
    ghostName: member.ghostName,
    ghostAvatar: member.ghostAvatar,
  };
}

@Injectable()
export class GameService {
  constructor(
    private readonly messages: MessageService,
    private readonly games: GameRepository,
    private readonly rates: RateLimitService,
  ) {}

  private status(game: StoredGame, now: Date): 'ACTIVE' | 'REVEALED' | 'ENDED' {
    if (
      game.endedAt ||
      game.deadlineAt <= now ||
      (game.kind === 'ANTAKSHARI' &&
        game.lastActionAt.getTime() + 300_000 <= now.getTime())
    )
      return game.kind === 'RPS' && !game.endedAt && game.deadlineAt <= now
        ? 'REVEALED'
        : 'ENDED';
    return 'ACTIVE';
  }

  private project(
    game: StoredGame,
    membershipId: string,
    code: string,
    now = new Date(),
  ) {
    const status = this.status(game, now);
    const base = {
      code,
      gameId: game.publicId,
      kind: game.kind as Kind,
      status,
      startedAt: game.createdAt.toISOString(),
      deadlineAt: game.deadlineAt.toISOString(),
      lastActionAt: game.lastActionAt.toISOString(),
      starter: participant(game.starter),
    };
    if (game.kind === 'RPS') {
      const mine =
        game.choices.find((item) => item.membershipId === membershipId)
          ?.choice ?? null;
      const revealed = status === 'REVEALED' && game.choices.length >= 2;
      const options = [...new Set(game.choices.map((item) => item.choice))];
      const beats: Record<Choice, Choice> = {
        ROCK: 'SCISSORS',
        PAPER: 'ROCK',
        SCISSORS: 'PAPER',
      };
      const winningChoice =
        revealed && options.length === 2
          ? beats[options[0] as Choice] === options[1]
            ? options[0]
            : options[1]
          : null;
      return {
        ...base,
        rps: {
          myChoice: mine,
          submittedCount: game.choices.length,
          choices: revealed
            ? game.choices.map((item) => ({
                player: participant(item.membership),
                choice: item.choice,
              }))
            : null,
          winnerIds: winningChoice
            ? game.choices
                .filter((item) => item.choice === winningChoice)
                .map((item) => item.membership.publicId)
            : [],
          outcome:
            status !== 'REVEALED'
              ? null
              : game.choices.length < 2
                ? 'NO_ROUND'
                : winningChoice
                  ? 'WIN'
                  : 'DRAW',
        },
        antakshari: null,
      };
    }
    const turns = [...game.turns].reverse();
    return {
      ...base,
      rps: null,
      antakshari: {
        nextCue: game.turns[0]?.nextCue ?? null,
        lastPlayerId: game.turns[0]?.membership.publicId ?? null,
        turns: turns.map((turn) => ({
          messageId: turn.message.publicId,
          player: participant(turn.membership),
          title: turn.title,
          nextCue: turn.nextCue,
          createdAt: turn.createdAt.toISOString(),
        })),
      },
    };
  }

  latest(hash: string, code: string) {
    return this.messages.access(
      hash,
      code,
      async ({ tx, room, membership }) => {
        const game = await this.games.latest(tx, room.id);
        return {
          game: game ? this.project(game, membership.id, room.code) : null,
        };
      },
    );
  }

  start(hash: string, code: string, body: unknown) {
    const input = fields(body, ['kind', 'clientGameId']);
    if (
      !['RPS', 'ANTAKSHARI'].includes(input.kind as string) ||
      typeof input.clientGameId !== 'string' ||
      !uuid.test(input.clientGameId)
    )
      throw new BadRequestException({ code: 'INVALID_GAME_ACTION' });
    return this.messages.access(
      hash,
      code,
      async ({ tx, room, membership }) => {
        const previous = await this.games.byStartKey(
          tx,
          room.id,
          membership.id,
          input.clientGameId as string,
        );
        if (previous) {
          if (previous.kind !== input.kind)
            throw new ConflictException({ code: 'GAME_RETRY_CONFLICT' });
          return {
            game: this.project(previous, membership.id, room.code),
            changed: false,
          };
        }
        const current = await this.games.latest(tx, room.id);
        if (current && this.status(current, new Date()) === 'ACTIVE')
          throw new ConflictException({ code: 'GAME_ACTIVE' });
        const now = new Date();
        const game = await this.games.create(
          tx,
          room.id,
          membership.id,
          input.clientGameId as string,
          input.kind as Kind,
          new Date(
            Math.min(
              room.expiresAt.getTime(),
              input.kind === 'RPS'
                ? now.getTime() + 30_000
                : room.expiresAt.getTime(),
            ),
          ),
        );
        return {
          game: this.project(game, membership.id, room.code, now),
          changed: true,
        };
      },
      true,
    );
  }

  private async find(tx: Prisma.TransactionClient, roomId: string, id: string) {
    if (!publicId.test(id))
      throw new NotFoundException({ code: 'GAME_NOT_FOUND' });
    const game = await this.games.byPublic(tx, id);
    if (!game || game.roomId !== roomId)
      throw new NotFoundException({ code: 'GAME_NOT_FOUND' });
    return game;
  }

  choose(hash: string, code: string, id: string, body: unknown) {
    const input = fields(body, ['choice']);
    if (!['ROCK', 'PAPER', 'SCISSORS'].includes(input.choice as string))
      throw new BadRequestException({ code: 'INVALID_GAME_ACTION' });
    return this.messages.access(
      hash,
      code,
      async ({ tx, room, membership }) => {
        const game = await this.find(tx, room.id, id);
        if (game.kind !== 'RPS')
          throw new BadRequestException({ code: 'WRONG_GAME_KIND' });
        const previous = game.choices.find(
          (item) => item.membershipId === membership.id,
        );
        if (previous) {
          if (previous.choice !== input.choice)
            throw new ConflictException({ code: 'GAME_CHOICE_LOCKED' });
          return {
            game: this.project(game, membership.id, room.code),
            changed: false,
          };
        }
        if (this.status(game, new Date()) !== 'ACTIVE')
          throw new GoneException({ code: 'GAME_ENDED' });
        const updated = await this.games.choose(
          tx,
          game.id,
          membership.id,
          input.choice as Choice,
        );
        return {
          game: this.project(updated, membership.id, room.code),
          changed: true,
        };
      },
      true,
    );
  }

  turn(hash: string, code: string, id: string, body: unknown) {
    const input = fields(body, ['clientTurnId', 'title', 'nextCue']);
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    const nextCue =
      typeof input.nextCue === 'string' ? input.nextCue.trim() : '';
    if (
      typeof input.clientTurnId !== 'string' ||
      !uuid.test(input.clientTurnId) ||
      !title ||
      title.length > 120 ||
      [...title].some((character) => character.charCodeAt(0) < 32) ||
      !nextCue ||
      nextCue.length > 12 ||
      [...nextCue].some((character) => character.charCodeAt(0) < 32)
    )
      throw new BadRequestException({ code: 'INVALID_GAME_TURN' });
    return this.messages.access(
      hash,
      code,
      async ({ tx, room, membership, credential }) => {
        const game = await this.find(tx, room.id, id);
        if (game.kind !== 'ANTAKSHARI')
          throw new BadRequestException({ code: 'WRONG_GAME_KIND' });
        const previous = await this.games.turnByKey(
          tx,
          game.id,
          membership.id,
          input.clientTurnId as string,
        );
        if (previous) {
          if (previous.title !== title || previous.nextCue !== nextCue)
            throw new ConflictException({ code: 'GAME_RETRY_CONFLICT' });
          return {
            game: this.project(game, membership.id, room.code),
            message: this.messages.publicMessage(
              previous.message,
              room.code,
              membership.id,
            ),
            changed: false,
          };
        }
        if (this.status(game, new Date()) !== 'ACTIVE')
          throw new GoneException({ code: 'GAME_ENDED' });
        if (game.turns[0]?.membershipId === membership.id)
          throw new ConflictException({ code: 'WAIT_FOR_ANOTHER_PLAYER' });
        this.rates.consume('MESSAGE_BURST', credential.userId);
        const { updated, message } = await this.games.createTurn(
          tx,
          game,
          membership.id,
          input.clientTurnId as string,
          title,
          nextCue,
          new Date(),
        );
        return {
          game: this.project(updated, membership.id, room.code),
          message: this.messages.publicMessage(
            message,
            room.code,
            membership.id,
          ),
          changed: true,
        };
      },
      true,
    );
  }

  end(hash: string, code: string, id: string) {
    return this.messages.access(
      hash,
      code,
      async ({ tx, room, membership }) => {
        const game = await this.find(tx, room.id, id);
        if (
          game.startedByMembershipId !== membership.id &&
          membership.role !== 'OWNER'
        )
          throw new ForbiddenException({ code: 'GAME_END_FORBIDDEN' });
        if (game.endedAt)
          return {
            game: this.project(game, membership.id, room.code),
            changed: false,
          };
        const updated = await this.games.end(tx, game.id, new Date());
        return {
          game: this.project(updated, membership.id, room.code),
          changed: true,
        };
      },
      true,
    );
  }
}
