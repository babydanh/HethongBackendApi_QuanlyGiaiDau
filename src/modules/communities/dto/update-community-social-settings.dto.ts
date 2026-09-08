import { IsBoolean, IsIn, IsObject, IsOptional } from 'class-validator';

export class UpdateCommunitySocialSettingsDto {
  @IsOptional()
  @IsIn(['MEMBERS', 'ADMINS', 'OFF'])
  postingPolicy?: string;

  @IsOptional()
  @IsBoolean()
  postApprovalRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  commentsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  chatEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  publicFeed?: boolean;

  @IsOptional()
  @IsIn(['MEMBERS', 'ADMINS', 'OFF'])
  memberTaggingPolicy?: string;

  @IsOptional()
  @IsBoolean()
  memberMatchCreationEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  memberMatchScoringEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  memberMatchDeletionEnabled?: boolean;

  @IsOptional()
  @IsObject()
  matchScoringPresets?: Record<string, unknown>;
}
