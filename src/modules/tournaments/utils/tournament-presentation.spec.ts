import {
  mapPublicTournament,
  mapTournamentFormat,
} from './tournament-presentation';

describe('tournament presentation mapping', () => {
  it('mutates the tournament format from bracket configuration in place', () => {
    const tournament = {
      format: 'old-format',
      tournamentConfig: { bracketType: 'SINGLE_ELIMINATION' },
    };

    const mapped = mapTournamentFormat(tournament);

    expect(mapped).toBe(tournament);
    expect(tournament.format).toBe('SINGLE_ELIMINATION');
  });

  it('returns a shallow copy with the stable public banner flag', () => {
    const config = { hideFeaturedCardText: true };
    const tournament = { id: 'tournament-1', tournamentConfig: config };

    const mapped = mapPublicTournament(tournament);

    expect(mapped).not.toBe(tournament);
    expect(mapped.tournamentConfig).toBe(config);
    expect(mapped.hideFeaturedCardText).toBe(true);
    expect(mapPublicTournament({ tournamentConfig: null }).hideFeaturedCardText).toBe(
      false,
    );
  });
});
