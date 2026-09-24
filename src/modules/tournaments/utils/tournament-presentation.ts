export function mapTournamentFormat<
  T extends { format?: string | null; tournamentConfig?: unknown },
>(tournament: T): T {
  if (
    tournament &&
    tournament.tournamentConfig &&
    typeof tournament.tournamentConfig === 'object' &&
    'bracketType' in tournament.tournamentConfig &&
    typeof (tournament.tournamentConfig as Record<string, unknown>)
      .bracketType === 'string'
  ) {
    tournament.format = (
      tournament.tournamentConfig as Record<string, unknown>
    ).bracketType as string;
  }
  return tournament;
}

export function mapPublicTournament<T extends { tournamentConfig?: unknown }>(
  tournament: T,
): T & { hideFeaturedCardText: boolean } {
  const config = tournament.tournamentConfig;
  const hideFeaturedCardText =
    typeof config === 'object' && config !== null && !Array.isArray(config)
      ? (config as Record<string, unknown>).hideFeaturedCardText === true
      : false;

  return { ...tournament, hideFeaturedCardText };
}
