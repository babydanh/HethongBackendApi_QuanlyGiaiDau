import { UserRole } from '../constants/enums';
import type { JwtPayload } from '../../modules/auth/interfaces/jwt-payload.interface';

/**
 * Canonical role check. JWT strategy returns `roles` (array). Some legacy
 * services still read the singular `role` field. This helper reads `roles`
 * first, then falls back to `role`, so guard and service share one semantic.
 */
export function hasRole(
  user: Pick<JwtPayload, 'roles' | 'role'> | null | undefined,
  role: UserRole,
): boolean {
  if (!user) return false;
  if (Array.isArray(user.roles)) {
    return user.roles.includes(role);
  }
  return user.role === role;
}

export function isAdminUser(
  user: Pick<JwtPayload, 'roles' | 'role'> | null | undefined,
): boolean {
  return hasRole(user, UserRole.ADMIN);
}

/**
 * Object-level ownership policy for matches:
 * ADMIN (via canonical role helper) or the tournament creator is allowed.
 */
export function isMatchOwnerOrAdmin(
  user: Pick<JwtPayload, 'roles' | 'role' | 'sub'> | null | undefined,
  tournamentCreatedBy: string | null | undefined,
): boolean {
  if (!user) return false;
  if (isAdminUser(user)) return true;
  return Boolean(tournamentCreatedBy && user.sub && tournamentCreatedBy === user.sub);
}
