import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
export declare class AuthRepository {
    private readonly db;
    constructor(db: AppDb);
    findUserByEmail(email: string): Promise<{
        id: string;
        email: string;
        passwordHash: string | null;
        isEmailVerified: boolean;
        isPhoneVerified: boolean;
        isMock: boolean;
        acceptedTosAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }>;
    findUserRoles(userId: string): Promise<string[]>;
    findRoleByName(roleName: string): Promise<{
        id: string;
        name: string;
        slug: string;
        description: string | null;
        createdAt: Date;
    }>;
    createDefaultUserRanks(userId: string): Promise<void>;
    createUserWithProfile(userData: typeof schema.users.$inferInsert, profileData: typeof schema.profiles.$inferInsert, defaultRoleId: string): Promise<{
        id: string;
        email: string;
        passwordHash: string | null;
        isEmailVerified: boolean;
        isPhoneVerified: boolean;
        isMock: boolean;
        acceptedTosAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }>;
    createSession(sessionData: typeof schema.sessions.$inferInsert): Promise<{
        id: string;
        createdAt: Date;
        userId: string;
        refreshToken: string;
        userAgent: string | null;
        ipAddress: string | null;
        isRevoked: boolean;
        revokedAt: Date | null;
        expiresAt: Date;
    }>;
    findSessionByRefreshToken(refreshToken: string): Promise<{
        id: string;
        userId: string;
        refreshToken: string;
        userAgent: string | null;
        ipAddress: string | null;
        isRevoked: boolean;
        revokedAt: Date | null;
        expiresAt: Date;
        createdAt: Date;
    }>;
    updateSession(id: string, updateData: Partial<typeof schema.sessions.$inferInsert>): Promise<{
        id: string;
        userId: string;
        refreshToken: string;
        userAgent: string | null;
        ipAddress: string | null;
        isRevoked: boolean;
        revokedAt: Date | null;
        expiresAt: Date;
        createdAt: Date;
    }[]>;
    revokeSessionByToken(refreshToken: string): Promise<{
        id: string;
        userId: string;
        refreshToken: string;
        userAgent: string | null;
        ipAddress: string | null;
        isRevoked: boolean;
        revokedAt: Date | null;
        expiresAt: Date;
        createdAt: Date;
    }[]>;
    findAuthProvider(provider: string, providerUserId: string): Promise<{
        id: string;
        userId: string;
        provider: string;
        providerUserId: string;
        providerEmail: string | null;
        providerAvatarUrl: string | null;
        providerDisplayName: string | null;
        accessToken: string | null;
        refreshToken: string | null;
        tokenExpiresAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    createAuthProvider(data: typeof schema.authProviders.$inferInsert): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        provider: string;
        providerUserId: string;
        providerEmail: string | null;
        providerAvatarUrl: string | null;
        providerDisplayName: string | null;
        accessToken: string | null;
        refreshToken: string | null;
        tokenExpiresAt: Date | null;
    }>;
    createOAuthUser(userData: Omit<typeof schema.users.$inferInsert, 'passwordHash'> & {
        passwordHash: string | null;
    }, profileData: typeof schema.profiles.$inferInsert, defaultRoleId: string): Promise<{
        id: string;
        email: string;
        passwordHash: string | null;
        isEmailVerified: boolean;
        isPhoneVerified: boolean;
        isMock: boolean;
        acceptedTosAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }>;
}
