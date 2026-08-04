import { UserRole } from '../constants/enums';
import { hasRole, isAdminUser, isMatchOwnerOrAdmin } from './role.helper';

describe('role.helper', () => {
  describe('hasRole', () => {
    it('returns true when roles array contains the role', () => {
      expect(hasRole({ roles: ['REFEREE'], role: undefined }, UserRole.REFEREE)).toBe(true);
    });

    it('falls back to singular role when roles is absent', () => {
      expect(hasRole({ role: 'REFEREE' }, UserRole.REFEREE)).toBe(true);
    });

    it('roles array wins over singular role', () => {
      expect(hasRole({ roles: ['PLAYER'], role: 'REFEREE' }, UserRole.REFEREE)).toBe(false);
    });

    it('returns false for null/undefined user', () => {
      expect(hasRole(null, UserRole.ADMIN)).toBe(false);
      expect(hasRole(undefined, UserRole.ADMIN)).toBe(false);
    });

    it('returns false when role is missing', () => {
      expect(hasRole({ roles: ['PLAYER'] }, UserRole.ADMIN)).toBe(false);
    });
  });

  describe('isAdminUser', () => {
    it('true for ADMIN in roles array', () => {
      expect(isAdminUser({ roles: ['ADMIN'] })).toBe(true);
    });

    it('true for singular ADMIN', () => {
      expect(isAdminUser({ role: 'ADMIN' })).toBe(true);
    });

    it('false for ORGANIZER', () => {
      expect(isAdminUser({ roles: ['ORGANIZER'] })).toBe(false);
    });
  });

  describe('isMatchOwnerOrAdmin', () => {
    it('allows admin from roles array', () => {
      expect(isMatchOwnerOrAdmin({ sub: 'u1', roles: ['ADMIN'] }, 'creator-other')).toBe(true);
    });

    it('allows tournament creator', () => {
      expect(isMatchOwnerOrAdmin({ sub: 'creator-1', roles: ['ORGANIZER'] }, 'creator-1')).toBe(true);
    });

    it('rejects organizer from another tournament', () => {
      expect(isMatchOwnerOrAdmin({ sub: 'u2', roles: ['ORGANIZER'] }, 'creator-1')).toBe(false);
    });

    it('rejects null user and missing creator', () => {
      expect(isMatchOwnerOrAdmin(null, 'creator-1')).toBe(false);
      expect(isMatchOwnerOrAdmin({ sub: 'u1', roles: ['ORGANIZER'] }, null)).toBe(false);
    });
  });
});
