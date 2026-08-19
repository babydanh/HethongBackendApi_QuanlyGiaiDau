import * as fs from 'fs';
import * as path from 'path';

describe('Tournament security hardening — structural contracts', () => {
  const repositorySource = fs.readFileSync(
    path.join(__dirname, 'tournaments.repository.ts'),
    'utf8',
  );
  const serviceSource = fs.readFileSync(
    path.join(__dirname, 'tournaments.service.ts'),
    'utf8',
  );
  const schedulerSource = fs.readFileSync(
    path.join(__dirname, 'tournament-scheduler.service.ts'),
    'utf8',
  );
  const matchesControllerSource = fs.readFileSync(
    path.join(__dirname, '../matches/matches.controller.ts'),
    'utf8',
  );
  const matchesServiceSource = fs.readFileSync(
    path.join(__dirname, '../matches/matches.service.ts'),
    'utf8',
  );

  it('does not expose inviteCode in generic projections by default', () => {
    expect(repositorySource).toContain('includeInviteCode?: boolean');
    expect(repositorySource).toContain('const includeInviteCode = options?.includeInviteCode === true');
    expect(repositorySource).toContain('inviteCode: includeInviteCode ? _inviteCode : null');
    expect(repositorySource).toContain('inviteCode: includeInviteCode ? row.tournament.inviteCode : null');
    expect(serviceSource).toContain('includeInviteCode: true');
  });

  it('generates recurring Lite tournaments under a row lock and transaction', () => {
    expect(schedulerSource).toContain('this.db.transaction(async (tx) => {');
    expect(schedulerSource).toContain(".for('update')");
    expect(schedulerSource).toContain('.insert(schema.tournaments)');
    expect(schedulerSource).toContain('.insert(schema.tournamentDivisions)');
    expect(schedulerSource).toContain('.update(schema.tournaments)');
  });

  it('requires authentication for comments and limits public cheers', () => {
    expect(matchesControllerSource).toContain("@UseGuards(new RateLimitGuard(10, 60_000))\n  @Post(':id/comments')");
    expect(matchesControllerSource).not.toContain("@Public()\n  @SkipThrottle()\n  @Post(':id/comments')");
    expect(matchesControllerSource).toContain("@UseGuards(new RateLimitGuard(20, 60_000))\n  @Post(':id/cheer')");
    expect(matchesServiceSource).toContain("throw new UnauthorizedException('Bạn cần đăng nhập để bình luận')");
  });
});

export {};

