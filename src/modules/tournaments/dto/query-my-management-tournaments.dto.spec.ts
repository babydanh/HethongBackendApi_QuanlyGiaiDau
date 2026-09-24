import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryMyManagementTournamentsDto } from './query-my-management-tournaments.dto';

describe('QueryMyManagementTournamentsDto', () => {
  it('accepts the completed filter and offset pagination', async () => {
    const dto = plainToInstance(QueryMyManagementTournamentsDto, {
      status: 'COMPLETED',
      limit: '9',
      offset: '20',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.limit).toBe(9);
    expect(dto.offset).toBe(20);
    expect(dto.status).toBe('COMPLETED');
  });

  it('rejects a page size above the nine-card contract', async () => {
    const dto = plainToInstance(QueryMyManagementTournamentsDto, {
      limit: '10',
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects unsupported status values', async () => {
    const dto = plainToInstance(QueryMyManagementTournamentsDto, {
      status: 'IN_PROGRESS',
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
