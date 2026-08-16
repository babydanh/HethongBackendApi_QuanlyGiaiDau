import { ConflictException } from '@nestjs/common';
import {
  assertCanCreateActiveFootballTeam,
  assertCanJoinActiveFootballTeam,
  MAX_ACTIVE_FOOTBALL_TEAMS,
} from './football-team-limits';

describe('football team limits', () => {
  it('allows creation below the active-created limit and rejects the fourth active team', () => {
    expect(() =>
      assertCanCreateActiveFootballTeam(MAX_ACTIVE_FOOTBALL_TEAMS - 1),
    ).not.toThrow();
    expect(() =>
      assertCanCreateActiveFootballTeam(MAX_ACTIVE_FOOTBALL_TEAMS),
    ).toThrow(ConflictException);
  });

  it('keeps participation limit independent from creation limit', () => {
    expect(() => assertCanJoinActiveFootballTeam(0)).not.toThrow();
    expect(() =>
      assertCanJoinActiveFootballTeam(MAX_ACTIVE_FOOTBALL_TEAMS),
    ).toThrow(ConflictException);
  });
});
