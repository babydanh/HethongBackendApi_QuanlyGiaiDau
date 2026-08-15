import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryFootballTeamMemberCandidatesDto } from './query-football-team-member-candidates.dto';

describe('QueryFootballTeamMemberCandidatesDto', () => {
  it('normalizes a valid bounded member search query', async () => {
    const dto = plainToInstance(QueryFootballTeamMemberCandidatesDto, { q: 'an', limit: '20' });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.limit).toBe(20);
  });

  it.each([
    { q: 'a', limit: 10 },
    { q: 'an', limit: 0 },
    { q: 'an', limit: 21 },
    { q: 'an', limit: 'abc' },
  ])('rejects an invalid member search query: %o', async (input) => {
    const dto = plainToInstance(QueryFootballTeamMemberCandidatesDto, input);

    expect(await validate(dto)).not.toHaveLength(0);
  });
});