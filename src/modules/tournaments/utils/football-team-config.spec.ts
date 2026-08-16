import { BadRequestException } from '@nestjs/common';
import { assertValidFootballTeamConfig, resolveFootballTeamConfig } from './football-team-config';

describe('resolveFootballTeamConfig', () => {
  it('uses the selected team size and reserve limit', () => {
    expect(resolveFootballTeamConfig({ teamSize: 11, maxReserve: 7 })).toEqual({
      isTeamSport: true,
      mainSize: 11,
      maxReserve: 7,
      maxTotalSize: 18,
    });
  });

  it('supports legacy teamSizeOptions when the selected value is absent', () => {
    expect(resolveFootballTeamConfig({ teamSizeOptions: [5, 7], maxReserve: 3 })).toMatchObject({
      isTeamSport: true,
      mainSize: 5,
      maxReserve: 3,
      maxTotalSize: 8,
    });
  });

  it('does not allow reserves when the tournament disables them', () => {
    expect(resolveFootballTeamConfig({ teamSize: 7, allowReserve: false, maxReserve: 8 })).toMatchObject({
      isTeamSport: true,
      mainSize: 7,
      maxReserve: 0,
      maxTotalSize: 7,
    });
  });

  it('does not classify a normal individual tournament as team sport', () => {
    expect(resolveFootballTeamConfig({ bracketType: 'ROUND_ROBIN' })).toEqual({
      isTeamSport: false,
      mainSize: 0,
      maxReserve: 0,
      maxTotalSize: Number.MAX_SAFE_INTEGER,
    });
  });

  it('rejects an invalid football size or an impossible reserve capacity', () => {
    expect(() => assertValidFootballTeamConfig({ teamSize: 9 }, { requireTeamSize: true }))
      .toThrow(BadRequestException);
    expect(() => assertValidFootballTeamConfig({ teamSize: 11, maxReserve: 5, maxTeamSize: 12 }, { requireTeamSize: true }))
      .toThrow(BadRequestException);
  });

  it('accepts the shared 5/7/11 football contract', () => {
    expect(() => assertValidFootballTeamConfig({
      teamSize: 7,
      minTeamSize: 7,
      teamSizeOptions: [5, 7, 11],
      maxReserve: 5,
      maxTeamSize: 12,
      penaltyShootout: true,
    }, { requireTeamSize: true })).not.toThrow();
  });
});
