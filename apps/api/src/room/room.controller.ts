import { SocialAccessGuard } from 'src/common/auth/social-access.guard';
import { RateLimit } from 'src/safety/rate-limit.guard';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AnonymousIdentityGuard } from 'src/common/auth/anonymous-identity.guard';
import type { AuthenticatedIdentity } from 'src/common/auth/authenticated-request';
import { CreateRoomDto } from './dto/create-room.dto';
import { RoomService } from './room.service';
import { CurrentIdentity } from 'src/common/decorators/current-identity.decorator';

@Controller('rooms')
@UseGuards(AnonymousIdentityGuard, SocialAccessGuard)
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  @Post()
  @RateLimit('ROOM_CREATE')
  async createRoom(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Body() dto: CreateRoomDto,
  ) {
    return this.roomService.createRoom(identity.id, dto);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  listRooms(@CurrentIdentity() identity: AuthenticatedIdentity) {
    return this.roomService.listRooms(identity.id);
  }

  @Get('discover')
  @Header('Cache-Control', 'no-store')
  @RateLimit('ROOM_JOIN')
  discoverRooms(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Query('cursor') cursor?: string,
  ) {
    return this.roomService.discoverRooms(identity.id, cursor);
  }

  @Patch(':code/discovery')
  @RateLimit('ROOM_JOIN')
  setDiscovery(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('code') code: string,
    @Body() body: unknown,
  ) {
    return this.roomService.setDiscovery(identity.id, code, body);
  }

  @Get(':code')
  @Header('Cache-Control', 'no-store')
  getRoom(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('code') code: string,
  ) {
    return this.roomService.getRoom(identity.id, code);
  }

  @Get(':code/members')
  @Header('Cache-Control', 'no-store')
  getMembers(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('code') code: string,
  ) {
    return this.roomService.getMembers(identity.id, code);
  }

  @Post(':code/participants/:participantId/reports')
  @HttpCode(202)
  @RateLimit('MESSAGE_REPORT')
  reportParticipant(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('code') code: string,
    @Param('participantId') participantId: string,
    @Body() body: unknown,
  ) {
    return this.roomService.reportParticipant(
      identity.id,
      code,
      participantId,
      body,
    );
  }

  @Post(':code/participants/:participantId/block')
  @HttpCode(200)
  @RateLimit('MATCH_ACTION')
  blockParticipant(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('code') code: string,
    @Param('participantId') participantId: string,
  ) {
    return this.roomService.blockParticipant(identity.id, code, participantId);
  }

  @Get(':code/membership')
  @Header('Cache-Control', 'no-store')
  getMembership(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('code') code: string,
  ) {
    return this.roomService.getMembership(identity.id, code);
  }

  @Post(':code/join')
  @RateLimit('ROOM_JOIN')
  @HttpCode(200)
  joinRoom(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('code') code: string,
  ) {
    return this.roomService.joinRoom(identity.id, code);
  }

  @Post(':code/invites/:inviteId/join')
  @RateLimit('ROOM_JOIN')
  @HttpCode(200)
  joinInvite(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('code') code: string,
    @Param('inviteId') inviteId: string,
  ) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        inviteId,
      )
    )
      throw new BadRequestException({
        code: 'INVALID_ROOM_INVITE',
        message: 'Invalid room invite.',
      });
    return this.roomService.joinRoom(identity.id, code, inviteId);
  }

  @Post(':code/leave')
  @HttpCode(204)
  leaveRoom(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('code') code: string,
  ) {
    return this.roomService.leaveRoom(identity.id, code);
  }
}
