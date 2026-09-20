import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const PROFILE_POST_VISIBILITIES = ['FRIENDS'] as const;
export type ProfilePostVisibility = (typeof PROFILE_POST_VISIBILITIES)[number];

export class CreateProfilePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  body?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  mediaUrls?: string[];

  @IsOptional()
  @IsIn(PROFILE_POST_VISIBILITIES)
  visibility?: ProfilePostVisibility;

  @IsOptional()
  @IsString()
  sharedPostId?: string;
}
