import { NotFoundException } from '@nestjs/common';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { AppDb } from '../../database/db.types';
import type { AuditService } from '../audit/audit.service';
import { MatchesRepository } from './matches.repository';
import type { UpdateMatchStatusDto } from './dto/update-match-status.dto';

describe('MatchesRepository.updateStatus', () => {
  it('does not update or reload a soft-deleted match', async () => {
    let whereClause: SQL | undefined;
    const db = {
      update: () => ({
        set: () => ({
          where: (condition: SQL) => {
            whereClause = condition;
            return { returning: async () => [] };
          },
        }),
      }),
    };
    const repository = new MatchesRepository(
      db as unknown as AppDb,
      {} as unknown as AuditService,
    );
    const reload = jest.spyOn(repository, 'findById');

    await expect(
      repository.updateStatus('deleted-match', {
        status: 'ONGOING',
      } satisfies UpdateMatchStatusDto),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(whereClause).toBeDefined();
    expect(new PgDialect().sqlToQuery(whereClause as SQL).sql).toContain(
      'deleted_at',
    );
    expect(reload).not.toHaveBeenCalled();
  });
});
