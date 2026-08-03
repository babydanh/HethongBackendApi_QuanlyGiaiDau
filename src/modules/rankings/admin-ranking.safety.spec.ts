import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('admin Elo safety guardrails', () => {
  const serviceSource = readFileSync(
    join(__dirname, 'admin-ranking.service.ts'),
    'utf8',
  );
  const rankingsServiceSource = readFileSync(
    join(__dirname, 'rankings.service.ts'),
    'utf8',
  );
  const controllerSource = readFileSync(
    join(__dirname, 'rankings.controller.ts'),
    'utf8',
  );
  const repositorySource = readFileSync(
    join(__dirname, 'rankings.repository.ts'),
    'utf8',
  );

  it('serializes context mutations and reserves operation keys transactionally', () => {
    expect(serviceSource).toContain('pg_advisory_xact_lock');
    expect(rankingsServiceSource).toContain('elo-tier:');
    expect(serviceSource).toContain('onConflictDoNothing');
    expect(serviceSource).toContain('payloadFingerprint');
  });

  it('writes both domain and generic audit evidence after a committed operation', () => {
    expect(serviceSource).toContain('this.auditService.logCreate');
    expect(serviceSource).toContain("'admin_elo_operations'");
    expect(serviceSource).toContain('previousElo');
    expect(serviceSource).toContain('newStatus');
  });

  it('keeps all admin Elo routes behind the full-admin role decorator', () => {
    const adminRouteBlocks = controllerSource.match(
      /@(Get|Post)\('admin\/[^']+'\)[\s\S]*?@Roles\(UserRole\.ADMIN\)/g,
    );
    expect(adminRouteBlocks).toHaveLength(5);
    expect(controllerSource).toContain(
      "@Get('admin/players')\n  @ApiBearerAuth()",
    );
    expect(controllerSource).toContain(
      "@Get('admin/players/:userId/detail')\n  @ApiBearerAuth()",
    );
    expect(controllerSource).toContain(
      "@Get('admin/contexts')\n  @ApiBearerAuth()",
    );
    expect(controllerSource).toContain(
      "@Post('admin/operations')\n  @ApiBearerAuth()",
    );
  });

  it('requires active categories and keeps grouped player filters scoped', () => {
    expect(serviceSource).toContain('assertActiveCategory(query.categoryId)');
    expect(serviceSource).toContain('ELO_PUBLIC_COMMUNITY_FORBIDDEN');
    expect(serviceSource).toContain("COUNT(*) FILTER (WHERE scope = 'PUBLIC')");
    expect(serviceSource).toContain(
      "COUNT(*) FILTER (WHERE scope = 'COMMUNITY')",
    );
  });

  it('rejects malformed context and history cursors instead of restarting pagination', () => {
    expect(serviceSource).toContain(
      "throw new BadRequestException('ELO_CURSOR_INVALID')",
    );
  });

  it('uses persisted community peak Elo and does not turn admin changes into activity', () => {
    expect(serviceSource).toContain(
      'peakElo: schema.communityRankings.peakElo',
    );
    expect(serviceSource).not.toContain('peakElo: sql<number>`1000`');
    expect(serviceSource).not.toContain('lastActiveAt: now');
    expect(serviceSource).not.toContain('lastDecayAt: now');
  });

  it('returns the admin bootstrap flag in user profile ranking projections', () => {
    expect(repositorySource).toContain(
      'adminLeaderboardEligible: schema.userRanks.adminLeaderboardEligible',
    );
    expect(repositorySource).toContain(
      'adminLeaderboardEligible: schema.communityRankings.adminLeaderboardEligible',
    );
  });

  it('uses real matches or an explicit admin bootstrap flag for eligible singles reads', () => {
    expect(repositorySource).toContain(
      'eq(schema.communityRankings.adminLeaderboardEligible, true)',
    );
    expect(repositorySource).toContain(
      'eq(schema.userRanks.adminLeaderboardEligible, true)',
    );
    expect(repositorySource).toContain('gt(schema.pairRanks.matchesPlayed, 0)');
    expect(serviceSource).toContain('shouldGrantAdminLeaderboardBootstrap');
    expect(serviceSource).toContain('nextLeaderboardEligible = true');
  });

  it('keeps active hidden and banned contexts out of public and pair reads', () => {
    expect(repositorySource).toContain('notExists(');
    expect(repositorySource).toContain("'HIDDEN'");
    expect(repositorySource).toContain("'BANNED'");
    expect(repositorySource).toContain('pairRanks.user1Id');
    expect(repositorySource).toContain('pairRanks.user2Id');
  });
});
