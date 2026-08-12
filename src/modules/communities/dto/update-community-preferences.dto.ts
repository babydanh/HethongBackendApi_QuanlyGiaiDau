import { IsBoolean } from 'class-validator';

export class UpdateCommunityPreferencesDto {
  @IsBoolean()
  muted!: boolean;

  @IsBoolean()
  notificationsEnabled!: boolean;
}
