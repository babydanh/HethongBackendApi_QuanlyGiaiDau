import { Injectable, Optional } from '@nestjs/common';
import { LiveScoreGateway } from '../../matches/live-score.gateway';

@Injectable()
export class TournamentRealtimeService {
  constructor(
    @Optional() private readonly liveScoreGateway?: LiveScoreGateway,
  ) {}

  broadcastRegistrationChanged(
    tournamentId: string,
    payload: {
      participantId?: string;
      divisionId?: string | null;
      action: string;
    },
  ) {
    this.liveScoreGateway?.broadcastRegistrationUpdate(tournamentId, payload);
  }
}
