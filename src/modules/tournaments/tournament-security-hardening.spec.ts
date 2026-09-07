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
  const tournamentsControllerSource = fs.readFileSync(
    path.join(__dirname, 'tournaments.controller.ts'),
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

  it('keeps football draft registrations ineligible for payment until the roster is complete', () => {
    expect(repositorySource).toContain('hasUndersizedFootballRoster');
    // Keep this structural contract independent from Prettier indentation.
    // The production branch may be reformatted without changing the payment
    // eligibility rule.
    expect(repositorySource.replace(/\s+/g, ' ')).toContain(
      "hasUndersizedFootballRoster ? 'PENDING'",
    );
    expect(repositorySource).toContain('const nextParticipantStatus =');
    expect(repositorySource).toContain(".set({ teamStatus: nextParticipantStatus })");
  });

  it('keeps Super Lite live scoring separate from participant kick management', () => {
    expect(matchesServiceSource).toContain('const canScoreSuperLite');
    expect(matchesServiceSource).toContain('const canStartSuperLite');
    expect(tournamentsControllerSource).toContain(
      "@Post(':id/participants/:participantId/kick')",
    );
    expect(tournamentsControllerSource).not.toContain(
      "@Post(':id/participants/:participantId/kick')\n  @Public()",
    );
    expect(serviceSource).toContain('async kickParticipant(');
    expect(serviceSource).toContain(
      "'Bạn không có quyền loại người tham gia này'",
    );
  });
});

export {};
