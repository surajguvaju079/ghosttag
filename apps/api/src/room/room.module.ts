import { IdentityModule } from "src/identity/identity.module";
import { RoomController } from "./room.controller";
import { RoomService } from "./room.service";
import { Module } from "@nestjs/common";





@Module({
  imports: [IdentityModule],
  controllers: [RoomController],
  providers: [RoomService],
})

export class RoomModule { }
