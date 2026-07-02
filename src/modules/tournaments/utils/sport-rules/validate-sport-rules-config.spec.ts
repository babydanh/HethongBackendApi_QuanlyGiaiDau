import { BadRequestException } from '@nestjs/common';
import { validateSportRuleConfig } from './validate-sport-rules-config';

describe('validateSportRuleConfig', () => {
  it('accepts tennis payload when kind matches allowedKinds', () => {
    expect(() =>
      validateSportRuleConfig(
        {
          kind: 'TENNIS',
          scoringModel: 'TENNIS_SET',
          format: {
            bestOfSets: 3,
            gamesPerSet: 6,
            winByTwoGames: true,
            tiebreakAtGames: 6,
            tiebreakPoints: 7,
            finalSetMode: 'STANDARD',
          },
        },
        {
          sourceLabel: 'sportRules',
          expectedKind: 'TENNIS',
          allowedKinds: ['TENNIS'],
        },
      ),
    ).not.toThrow();
  });

  it('rejects payload when kind is outside allowedKinds', () => {
    expect(() =>
      validateSportRuleConfig(
        {
          kind: 'PICKLEBALL_SIDE_OUT',
          scoringModel: 'PICKLEBALL_SIDE_OUT',
          format: {
            gamePoint: 11,
            winByTwo: true,
            firstServerRule: 'STANDARD',
            doublesServeFlow: 'TWO_SERVER',
          },
        },
        {
          sourceLabel: 'sportRules',
          expectedKind: 'TENNIS',
          allowedKinds: ['TENNIS'],
        },
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects tennis payload when scoringModel does not match kind', () => {
    expect(() =>
      validateSportRuleConfig(
        {
          kind: 'TENNIS',
          scoringModel: 'RALLY_POINT_SET',
          format: {
            bestOfSets: 3,
            gamesPerSet: 6,
            winByTwoGames: true,
            tiebreakAtGames: 6,
            tiebreakPoints: 7,
            finalSetMode: 'STANDARD',
          },
        },
        {
          sourceLabel: 'sportRules',
          expectedKind: 'TENNIS',
          allowedKinds: ['TENNIS'],
        },
      ),
    ).toThrow(BadRequestException);
  });
});
