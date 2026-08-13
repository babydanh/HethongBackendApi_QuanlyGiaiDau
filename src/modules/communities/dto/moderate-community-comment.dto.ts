import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ModerateCommunityCommentDto {
  @IsIn(['PUBLISHED', 'HIDDEN', 'REJECTED'])
  status!: 'PUBLISHED' | 'HIDDEN' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
