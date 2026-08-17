import { UserRole } from '../constants/enums';
import type { JwtPayload } from '../../modules/auth/interfaces/jwt-payload.interface';
export declare function hasRole(user: Pick<JwtPayload, 'roles' | 'role'> | null | undefined, role: UserRole): boolean;
export declare function isAdminUser(user: Pick<JwtPayload, 'roles' | 'role'> | null | undefined): boolean;
export declare function isMatchOwnerOrAdmin(user: Pick<JwtPayload, 'roles' | 'role' | 'sub'> | null | undefined, tournamentCreatedBy: string | null | undefined): boolean;
