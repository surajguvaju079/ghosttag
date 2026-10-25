import { RateLimit } from 'src/safety/rate-limit.guard';
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AnonymousIdentityGuard } from 'src/common/auth/anonymous-identity.guard';
import type { AuthenticatedIdentity } from 'src/common/auth/authenticated-request';
import { CreateRoomDto } from './dto/create-room.dto';
import { RoomService } from './room.service';
import { CurrentIdentity } from 'src/common/decorators/current-identity.decorator';

@Controller('rooms')
@UseGuards(AnonymousIdentityGuard)
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

  @Post(':code/leave')
  @HttpCode(204)
  leaveRoom(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('code') code: string,
  ) {
    return this.roomService.leaveRoom(identity.id, code);
  }
}
