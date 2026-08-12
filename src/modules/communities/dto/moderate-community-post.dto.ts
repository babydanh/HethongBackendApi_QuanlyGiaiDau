import { IsIn } from 'class-validator';

export class ModerateCommunityPostDto {
  @IsIn(['PUBLISHED', 'REJECTED', 'HIDDEN'])
  status!: 'PUBLISHED' | 'REJECTED' | 'HIDDEN';
}
