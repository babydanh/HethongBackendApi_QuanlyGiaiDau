import * as fs from 'fs';
import * as path from 'path';

describe('Match read scope — active tournament stage contract', () => {
  const matchesRepositorySource = fs.readFileSync(
    path.join(__dirname, 'matches.repository.ts'),
    'utf8',
  );
  const tournamentsRepositorySource = fs.readFileSync(
    path.join(__dirname, '../tournaments/tournaments.repository.ts'),
    'utf8',
  );

  it('requires every generic match list to stay inside a non-deleted stage', () => {
    expect(matchesRepositorySource).toContain('if (activeStageOnly)');
    expect(matchesRepositorySource).toContain('active_stage.deleted_at is null');
    expect(matchesRepositorySource).toContain(
      'active_stage.tournament_id = ${schema.matches.tournamentId}',
    );
  });

  it('filters soft-deleted matches from active bracket reads', () => {
    const findBracketBlock = tournamentsRepositorySource.slice(
      tournamentsRepositorySource.indexOf('async findBracket('),
      tournamentsRepositorySource.indexOf('async updateBracketSlots('),
    );

    expect(findBracketBlock).toContain('isNull(schema.matches.deletedAt)');
  });

  it('keeps tournament summary counts on the active bracket generation', () => {
    const findByIdBlock = tournamentsRepositorySource.slice(
      tournamentsRepositorySource.indexOf('async findById('),
      tournamentsRepositorySource.indexOf('async create('),
    );
    expect(findByIdBlock).toContain('isNull(schema.tournamentStages.deletedAt)');
    expect(findByIdBlock).toContain('isNull(schema.matches.deletedAt)');
  });

  it('does not expose live rows from a deleted bracket generation', () => {
    expect(matchesRepositorySource).toContain('liveStatusRequested');
    expect(matchesRepositorySource).toContain('requestedStatuses.length === 0');
    expect(matchesRepositorySource).toContain(
      "upper(${schema.matches.status}) not in ('ONGOING', 'IN_PROGRESS', 'LIVE', 'PLAYING')",
    );
    expect(matchesRepositorySource).toContain('${schema.matches.tournamentId} is null');
    expect(matchesRepositorySource).toContain('active_live_stage.deleted_at is null');
  });

  it('does not let deleted-stage rows block tournament completion', () => {
    const completionBlock = matchesRepositorySource.slice(
      matchesRepositorySource.indexOf('async checkAllMatchesCompleted('),
      matchesRepositorySource.indexOf('async updateTournamentStatus('),
    );
    expect(completionBlock).toContain('active_completion_stage.deleted_at is null');
    expect(completionBlock).toContain(
      'active_completion_stage.tournament_id = ${schema.matches.tournamentId}',
    );
  });

  it('versions match-list cache keys when the read scope changes', () => {
    const matchesServiceSource = fs.readFileSync(
      path.join(__dirname, 'matches.service.ts'),
      'utf8',
    );
    expect(matchesServiceSource).toContain("MATCH_LIST_CACHE_VERSION = 'v2'");
    expect(matchesServiceSource).toContain(
      'matches:list:${MATCH_LIST_CACHE_VERSION}:${JSON.stringify(query)}',
    );
  });
});

export {};
