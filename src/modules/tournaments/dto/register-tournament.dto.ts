import { IsNotEmpty, IsString, IsArray, IsUUID, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterTournamentDto {
  @ApiProperty({ description: 'Tên đội tham gia' })
  @IsString()
  @IsNotEmpty()
  teamName: string;

  @ApiProperty({ description: 'Danh sách ID các thành viên trong đội', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  memberIds: string[];
}
