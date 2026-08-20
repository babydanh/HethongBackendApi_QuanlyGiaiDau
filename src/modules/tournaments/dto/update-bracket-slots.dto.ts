import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum BracketSlotName {
  PARTICIPANT1 = 'participant1',
  PARTICIPANT2 = 'participant2',
}

export enum BracketSlotMutationOperation {
  ASSIGN = 'ASSIGN',
  MOVE = 'MOVE',
  REPLACE = 'REPLACE',
  UNASSIGN = 'UNASSIGN',
  SWAP = 'SWAP',
}

export class BracketSlotMutationDto {
  @ApiProperty({ enum: BracketSlotMutationOperation })
  @IsEnum(BracketSlotMutationOperation)
  operation!: BracketSlotMutationOperation;

  @ApiPropertyOptional({ description: 'Target match for ASSIGN, REPLACE, or UNASSIGN.' })
  @IsUUID()
  @IsOptional()
  matchId?: string;

  @ApiPropertyOptional({ enum: BracketSlotName })
  @IsEnum(BracketSlotName)
  @IsOptional()
  slot?: BracketSlotName;

  @ApiPropertyOptional({ description: 'Participant used by ASSIGN or REPLACE.' })
  @IsUUID()
  @IsOptional()
  participantId?: string;

  @ApiPropertyOptional({ description: 'Source match for MOVE or SWAP.' })
  @IsUUID()
  @IsOptional()
  fromMatchId?: string;

  @ApiPropertyOptional({ enum: BracketSlotName })
  @IsEnum(BracketSlotName)
  @IsOptional()
  fromSlot?: BracketSlotName;

  @ApiPropertyOptional({ description: 'Destination match for MOVE or SWAP.' })
  @IsUUID()
  @IsOptional()
  toMatchId?: string;

  @ApiPropertyOptional({ enum: BracketSlotName })
  @IsEnum(BracketSlotName)
  @IsOptional()
  toSlot?: BracketSlotName;

  @ApiPropertyOptional({ example: 1, description: 'Optional optimistic revision for the source match.' })
  @IsInt()
  @Min(1)
  @IsOptional()
  revision?: number;
}

export class UpdateBracketSlotsDto {
  @ApiProperty({ type: [BracketSlotMutationDto], minItems: 1 })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BracketSlotMutationDto)
  operations!: BracketSlotMutationDto[];
}
