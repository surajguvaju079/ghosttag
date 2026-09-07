import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { RoomVibe } from "generated/prisma/enums";



export class CreateRoomDto {
  @IsEnum(RoomVibe)
  vibe!: RoomVibe;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}
