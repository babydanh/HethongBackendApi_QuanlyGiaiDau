import { IsIn } from 'class-validator';

export class ReactCommunityPostDto {
  @IsIn(['LIKE', 'CHEER', 'RESPECT', 'LAUGH', 'CLUTCH'])
  reactionType!: string;
}
