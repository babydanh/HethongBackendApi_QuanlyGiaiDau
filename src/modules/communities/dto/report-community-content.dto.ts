import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReportCommunityContentDto {
  @IsIn(['SPAM', 'HARASSMENT', 'HATE', 'SEXUAL', 'VIOLENCE', 'OTHER'])
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  details?: string;
}
