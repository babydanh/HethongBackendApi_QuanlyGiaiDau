import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ModerateCommunityPostDto {
  @IsIn(['PUBLISHED', 'REJECTED', 'HIDDEN'])
  status!: 'PUBLISHED' | 'REJECTED' | 'HIDDEN';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class DeleteCommunityPostDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
