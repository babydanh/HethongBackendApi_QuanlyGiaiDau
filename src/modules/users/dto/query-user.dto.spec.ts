import { validate } from 'class-validator';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { UserRole } from '../../../common/constants/enums';
import { QueryUserDto } from './query-user.dto';

describe('QueryUserDto role filter', () => {
  it('accepts only known system roles', async () => {
    const valid = Object.assign(new QueryUserDto(), { role: UserRole.ORGANIZER });
    const invalid = Object.assign(new QueryUserDto(), { role: 'COMMUNITY_OWNER' });

    expect(await validate(valid)).toHaveLength(0);
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it('keeps sanctions out of the cursor-paginated user query', () => {
    const source = readFileSync(join(__dirname, '..', 'users.repository.ts'), 'utf8');

    expect(source).toContain('const activeBanRows = data.length > 0');
    expect(source).toContain('const activeBanByUserId = new Map');
    expect(source).toContain('orderBy(desc(schema.userBans.createdAt), desc(schema.userBans.id))');
    expect(source).not.toContain('.leftJoin(\n        schema.userBans');
  });
});
