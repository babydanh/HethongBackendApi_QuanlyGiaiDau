import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateReportDto } from './dto/create-report.dto';
import { QueryMyReportsDto } from './dto/query-my-reports.dto';
import { UpdateSystemRolesDto } from './dto/update-system-roles.dto';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    findAll(query: QueryUserDto): Promise<{
        data: {
            id: string;
            email: string;
            isEmailVerified: boolean;
            createdAt: Date;
            roles: string[];
            profile: {
                fullName: string;
                avatarUrl: string | undefined;
                isVerified: boolean;
            };
            activeBan: {
                banType: "WARN" | "SOFT_BAN" | "HARD_BAN";
                reason: string;
                expiresAt: string | undefined;
            } | undefined;
        }[];
        meta: {
            total: number;
            page: number;
            limit: number;
            totalPages: number;
            nextCursor: string | null;
            hasMore: boolean;
        };
    }>;
    searchPublic(q: string): Promise<{
        data: {
            id: string;
            email: string;
            isEmailVerified: boolean;
            createdAt: Date;
            roles: string[];
            profile: {
                fullName: string;
                avatarUrl: string | undefined;
                isVerified: boolean;
            };
            activeBan: {
                banType: "WARN" | "SOFT_BAN" | "HARD_BAN";
                reason: string;
                expiresAt: string | undefined;
            } | undefined;
        }[];
        meta: {
            total: number;
            page: number;
            limit: number;
            totalPages: number;
            nextCursor: string | null;
            hasMore: boolean;
        };
    } | {
        data: never[];
    }>;
    search(q: string): Promise<{
        id: string;
        email: string;
        fullName: string | null;
        avatarUrl: string | null;
        phoneNumber: string | null;
    }[]>;
    getProfile(user: {
        id: string;
    }): Promise<{
        role: string;
        roles: string[];
        id: string;
        email: string;
        isEmailVerified: boolean;
        isPhoneVerified: boolean;
        createdAt: Date;
        profile: {
            id: string;
            userId: string;
            fullName: string;
            avatarUrl: string | null;
            coverUrl: string | null;
            phoneNumber: string | null;
            dateOfBirth: string | null;
            gender: string | null;
            isGenderLocked: boolean;
            address: string | null;
            bio: string | null;
            provinceCode: string | null;
            isVerified: boolean;
            allowStrangerMessages: boolean;
            bankName: string | null;
            bankAccountNumber: string | null;
            bankAccountName: string | null;
            updatedAt: Date;
        } | null;
    }>;
    getMyReports(user: {
        id: string;
    }, query: QueryMyReportsDto): Promise<{
        data: {
            id: string;
            reporterId: string;
            targetType: string;
            targetId: string;
            source: string;
            sourceReferenceId: string | null;
            category: string;
            reason: string;
            evidenceUrls: string[];
            status: string;
            assignedTo: string | null;
            resolvedBy: string | null;
            resolutionNote: string | null;
            triagedAt: Date | null;
            resolvedAt: Date | null;
            createdAt: Date;
            updatedAt: Date;
        }[];
        meta: {
            total: number;
            page: number;
            limit: number;
            totalPages: number;
            nextCursor: string | null;
            hasMore: boolean;
        };
    }>;
    getPublicProfile(id: string): Promise<{
        role: string;
        roles: string[];
        ranks: {
            categoryId: string;
            categoryName: string;
            matchType: string;
            eloPoints: number;
            matchesPlayed: number;
            matchesWon: number;
            winStreak: number;
            tierName: string | null;
        }[];
        pairRanks: {
            id: string;
            categoryId: string;
            categoryName: string;
            matchType: string;
            eloPoints: number;
            matchesPlayed: number;
            matchesWon: number;
            winStreak: number;
            updatedAt: Date;
            partnerId: unknown;
            partnerName: unknown;
            partnerAvatarUrl: unknown;
        }[];
        highlightRank: {
            source: "SINGLES";
            categoryId: string;
            categoryName: string;
            matchType: string;
            eloPoints: number;
            matchesPlayed: number;
            matchesWon: number;
            winStreak: number;
            tierName: string | null;
        } | {
            source: "DOUBLES";
            id: string;
            categoryId: string;
            categoryName: string;
            matchType: string;
            eloPoints: number;
            matchesPlayed: number;
            matchesWon: number;
            winStreak: number;
            updatedAt: Date;
            partnerId: unknown;
            partnerName: unknown;
            partnerAvatarUrl: unknown;
        } | null;
        achievements: {
            tournamentId: string;
            tournamentName: string;
            rank: 1 | 2 | 3;
            completedAt: string | null;
            tournamentDate: string | null;
        }[];
        id: string;
        createdAt: Date;
        isMock: boolean;
        fullName: string | null;
        avatarUrl: string | null;
        coverUrl: string | null;
        gender: string | null;
        bio: string | null;
        isVerified: boolean | null;
    }>;
    findOne(id: string): Promise<{
        role: string;
        roles: string[];
        id: string;
        email: string;
        isEmailVerified: boolean;
        isPhoneVerified: boolean;
        createdAt: Date;
        profile: {
            id: string;
            userId: string;
            fullName: string;
            avatarUrl: string | null;
            coverUrl: string | null;
            phoneNumber: string | null;
            dateOfBirth: string | null;
            gender: string | null;
            isGenderLocked: boolean;
            address: string | null;
            bio: string | null;
            provinceCode: string | null;
            isVerified: boolean;
            allowStrangerMessages: boolean;
            bankName: string | null;
            bankAccountNumber: string | null;
            bankAccountName: string | null;
            updatedAt: Date;
        } | null;
    }>;
    updateSystemRoles(admin: {
        id: string;
    }, id: string, dto: UpdateSystemRolesDto): Promise<{
        userId: string;
        roles: string[];
    }>;
    updateProfile(user: {
        id: string;
    }, updateUserDto: UpdateUserDto): Promise<{
        role: string;
        roles: string[];
        id: string;
        email: string;
        isEmailVerified: boolean;
        isPhoneVerified: boolean;
        createdAt: Date;
        profile: {
            id: string;
            userId: string;
            fullName: string;
            avatarUrl: string | null;
            coverUrl: string | null;
            phoneNumber: string | null;
            dateOfBirth: string | null;
            gender: string | null;
            isGenderLocked: boolean;
            address: string | null;
            bio: string | null;
            provinceCode: string | null;
            isVerified: boolean;
            allowStrangerMessages: boolean;
            bankName: string | null;
            bankAccountNumber: string | null;
            bankAccountName: string | null;
            updatedAt: Date;
        } | null;
    }>;
    uploadAvatar(user: {
        id: string;
    }, file: Express.Multer.File): Promise<{
        role: string;
        roles: string[];
        id: string;
        email: string;
        isEmailVerified: boolean;
        isPhoneVerified: boolean;
        createdAt: Date;
        profile: {
            id: string;
            userId: string;
            fullName: string;
            avatarUrl: string | null;
            coverUrl: string | null;
            phoneNumber: string | null;
            dateOfBirth: string | null;
            gender: string | null;
            isGenderLocked: boolean;
            address: string | null;
            bio: string | null;
            provinceCode: string | null;
            isVerified: boolean;
            allowStrangerMessages: boolean;
            bankName: string | null;
            bankAccountNumber: string | null;
            bankAccountName: string | null;
            updatedAt: Date;
        } | null;
    }>;
    uploadCover(user: {
        id: string;
    }, file: Express.Multer.File): Promise<{
        role: string;
        roles: string[];
        id: string;
        email: string;
        isEmailVerified: boolean;
        isPhoneVerified: boolean;
        createdAt: Date;
        profile: {
            id: string;
            userId: string;
            fullName: string;
            avatarUrl: string | null;
            coverUrl: string | null;
            phoneNumber: string | null;
            dateOfBirth: string | null;
            gender: string | null;
            isGenderLocked: boolean;
            address: string | null;
            bio: string | null;
            provinceCode: string | null;
            isVerified: boolean;
            allowStrangerMessages: boolean;
            bankName: string | null;
            bankAccountNumber: string | null;
            bankAccountName: string | null;
            updatedAt: Date;
        } | null;
    }>;
    changePassword(user: {
        id: string;
    }, changePasswordDto: ChangePasswordDto): Promise<{
        message: string;
    }>;
    remove(id: string): Promise<{
        message: string;
    }>;
    createReport(user: {
        id: string;
    }, dto: CreateReportDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        reason: string;
        evidenceUrls: string[];
        resolvedBy: string | null;
        resolutionNote: string | null;
        resolvedAt: Date | null;
        reporterId: string;
        targetType: string;
        targetId: string;
        source: string;
        sourceReferenceId: string | null;
        category: string;
        assignedTo: string | null;
        triagedAt: Date | null;
    }>;
    deleteAccount(user: {
        id: string;
    }, body: {
        password: string;
    }): Promise<{
        success: boolean;
        message: string;
    }>;
    createChangeRequest(user: {
        id: string;
    }, body: {
        requestType: 'GENDER' | 'EMAIL';
        newValue: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        status: string;
        requestType: string;
        oldValue: string;
        newValue: string;
        adminNote: string | null;
    }>;
    findChangeRequests(status?: string): Promise<{
        id: string;
        userId: string;
        requestType: string;
        oldValue: string;
        newValue: string;
        status: string;
        adminNote: string | null;
        createdAt: Date;
        userEmail: string;
        userFullName: string | null;
    }[]>;
    approveChangeRequest(id: string, body: {
        adminNote?: string;
    }): Promise<{
        id: string;
        userId: string;
        requestType: string;
        oldValue: string;
        newValue: string;
        status: string;
        adminNote: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    rejectChangeRequest(id: string, body: {
        adminNote?: string;
    }): Promise<{
        id: string;
        userId: string;
        requestType: string;
        oldValue: string;
        newValue: string;
        status: string;
        adminNote: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
}
