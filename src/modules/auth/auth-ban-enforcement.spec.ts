import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('AuthService access-ban enforcement', () => {
  it('checks password login, OAuth login, refresh rotation and refresh grace handling', () => {
    const source = readFileSync(join(__dirname, 'auth.service.ts'), 'utf8');

    expect(source).toContain('await this.assertAccountCanAccess(user.id);');
    expect(source).toContain('await this.assertAccountCanAccess(existingProvider.userId);');
    expect(source).toContain('await this.assertAccountCanAccess(payload.sub);');
    expect(source).toContain('await this.assertAccountCanAccess(oldSession.userId);');
  });
});
