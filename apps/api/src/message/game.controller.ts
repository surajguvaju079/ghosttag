import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AnonymousIdentityGuard } from 'src/common/auth/anonymous-identity.guard';
import { SocialAccessGuard } from 'src/common/auth/social-access.guard';
import type { AuthenticatedRequest } from 'src/common/auth/authenticated-request';
import { RateLimit } from 'src/safety/rate-limit.guard';
import { GameService } from './game.service';
import { MessageGateway } from './message.gateway';

@Controller('rooms/:code/game')
@UseGuards(AnonymousIdentityGuard, SocialAccessGuard)
export class GameController {
  constructor(
    private readonly games: GameService,
    private readonly gateway: MessageGateway,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  latest(@Req() request: AuthenticatedRequest, @Param('code') code: string) {
    return this.games.latest(request.credentialHash, code);
  }

  @Post()
  @HttpCode(200)
  @RateLimit('GAME_ACTION')
  async start(
    @Req() request: AuthenticatedRequest,
    @Param('code') code: string,
    @Body() body: unknown,
  ) {
    const result = await this.games.start(request.credentialHash, code, body);
    if (result.changed)
      await this.gateway.notifyGame(result.game.code, result.game.gameId);
    return result.game;
  }

  @Post(':gameId/choice')
  @HttpCode(200)
  @RateLimit('GAME_ACTION')
  async choose(
    @Req() request: AuthenticatedRequest,
    @Param('code') code: string,
    @Param('gameId') gameId: string,
    @Body() body: unknown,
  ) {
    const result = await this.games.choose(
      request.credentialHash,
      code,
      gameId,
      body,
    );
    if (result.changed)
      await this.gateway.notifyGame(result.game.code, result.game.gameId);
    return result.game;
  }

  @Post(':gameId/turn')
  @HttpCode(200)
  @RateLimit('GAME_ACTION')
  async turn(
    @Req() request: AuthenticatedRequest,
    @Param('code') code: string,
    @Param('gameId') gameId: string,
    @Body() body: unknown,
  ) {
    const result = await this.games.turn(
      request.credentialHash,
      code,
      gameId,
      body,
    );
    if (result.changed) {
      await this.gateway.notifyMessage(result.message);
      await this.gateway.notifyGame(result.game.code, result.game.gameId);
    }
    return { game: result.game, message: result.message };
  }

  @Post(':gameId/end')
  @HttpCode(200)
  @RateLimit('GAME_ACTION')
  async end(
    @Req() request: AuthenticatedRequest,
    @Param('code') code: string,
    @Param('gameId') gameId: string,
  ) {
    const result = await this.games.end(request.credentialHash, code, gameId);
    if (result.changed)
      await this.gateway.notifyGame(result.game.code, result.game.gameId);
    return result.game;
  }
}
