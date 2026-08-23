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
    expect(adminRouteBlocks).toHaveLength(3);
    expect(controllerSource).toContain(
      "@Get('admin/contexts')\n  @ApiBearerAuth()",
    );
    expect(controllerSource).toContain(
      "@Post('admin/operations')\n  @ApiBearerAuth()",
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

  it('keeps active hidden and banned contexts out of public and pair reads', () => {
    expect(repositorySource).toContain('notExists(');
    expect(repositorySource).toContain("'HIDDEN'");
    expect(repositorySource).toContain("'BANNED'");
    expect(repositorySource).toContain('pairRanks.user1Id');
    expect(repositorySource).toContain('pairRanks.user2Id');
  });
});
