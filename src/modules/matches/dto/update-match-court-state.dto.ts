import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class UpdateMatchCourtStateDto {
  @ApiProperty({
    description:
      'CourtState của sân pickleball. Server validate đúng schema (sai → 400), tự gán updatedAt/updatedBy và chỉ giữ tối đa 20 snapshot history mới nhất.',
    example: {
      version: 1,
      startingRight: { team1: 0, team2: 1 },
      endsOverride: null,
      autoSwitchEnds: true,
      midSetSwitchDone: false,
      serverOverride: null,
      turnStart: {
        team: 1,
        serverNumber: 2,
        teamScoreAtStart: 3,
        serverPlayerIndex: 1,
      },
      history: [],
    },
  })
  @IsObject()
  courtState: Record<string, unknown>;
}
