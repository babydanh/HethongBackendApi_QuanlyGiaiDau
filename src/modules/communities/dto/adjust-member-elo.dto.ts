import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export enum EloOperation {
  ADD = 'ADD',
  SUBTRACT = 'SUBTRACT',
  SET = 'SET',
}

export class AdjustMemberEloDto {
  @ApiProperty({ enum: EloOperation, example: EloOperation.ADD })
  @IsEnum(EloOperation)
  operation: EloOperation;

  @ApiProperty({ example: 25, description: 'Số điểm ELO điều chỉnh' })
  @IsInt()
  @Min(0)
  points: number;

  @ApiProperty({ example: 'Đạt giải tuần', description: 'Lý do điều phối ELO' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
