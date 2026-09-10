import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QueryMyManagementTournamentsDto } from './query-my-management-tournaments.dto';

describe('QueryMyManagementTournamentsDto', () => {
  it('accepts the completed filter and offset pagination', async () => {
    const dto = plainToInstance(QueryMyManagementTournamentsDto, {
      status: 'COMPLETED',
      limit: '10',
      offset: '20',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.limit).toBe(10);
    expect(dto.offset).toBe(20);
    expect(dto.status).toBe('COMPLETED');
  });

  it('rejects a page size above the ten-card contract', async () => {
    const dto = plainToInstance(QueryMyManagementTournamentsDto, {
      limit: '11',
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects unsupported status values', async () => {
    const dto = plainToInstance(QueryMyManagementTournamentsDto, {
      status: 'IN_PROGRESS',
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('keeps the completed predicate in list and count query paths', () => {
    const source = readFileSync(
      join(__dirname, '..', 'tournaments.repository.ts'),
      'utf8',
    );

    expect(source).toMatch(
      /const completedOnly\s*=\s*String\(\s*query\.status \?\? ''\s*\)\.toUpperCase\(\)\s*===\s*'COMPLETED'/s,
    );
    expect(source).toContain('const completedParentCondition = sql`exists');
    expect(source).toContain(
      'parentBaseConditions.push(completedParentCondition)',
    );
    expect(source).toContain(
      'parentCountConditions.push(completedParentCondition)',
    );
    expect(source).toContain("eq(schema.tournaments.status, 'COMPLETED')");
  });
});
