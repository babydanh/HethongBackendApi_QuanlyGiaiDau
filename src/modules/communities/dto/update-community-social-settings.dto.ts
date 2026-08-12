import { IsBoolean, IsIn, IsOptional } from 'class-validator';

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
}
