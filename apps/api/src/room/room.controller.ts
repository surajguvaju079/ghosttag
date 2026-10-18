import {
  Body,
  Controller,
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
  async createRoom(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Body() dto: CreateRoomDto,
  ) {
    return this.roomService.createRoom(identity.id, dto);
  }

  @Post(':code/join')
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
