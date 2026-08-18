import type { AppDb } from '../../database/db.types';
import type { CreateFootballTeamDto } from './dto/create-football-team.dto';
import type { UpdateFootballTeamDto } from './dto/update-football-team.dto';
import { AuditService } from '../audit/audit.service';
export declare class FootballTeamsRepository {
    private readonly db;
    private readonly auditService;
    constructor(db: AppDb, auditService: AuditService);
    create(userId: string, dto: CreateFootballTeamDto): Promise<{
        id: string;
        name: string;
        logoUrl: string | null;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string;
        status: string;
        communityId: string | null;
        categoryId: string;
        archivedAt: Date | null;
    }>;
    listMine(userId: string): Promise<{
        team: {
            id: string;
            name: string;
            logoUrl: string | null;
            categoryId: string;
            communityId: string | null;
            status: string;
            createdBy: string;
            createdAt: Date;
            updatedAt: Date;
            archivedAt: Date | null;
        };
        membership: {
            id: string;
            teamId: string;
            userId: string;
            role: string;
            status: string;
            invitedBy: string | null;
            joinedAt: Date | null;
            leftAt: Date | null;
            createdAt: Date;
            updatedAt: Date;
        };
        rank: {
            id: string;
            teamId: string;
            categoryId: string;
            tierId: string | null;
            eloPoints: number;
            matchesPlayed: number;
            matchesWon: number;
            winStreak: number;
            peakElo: number;
            lastMatchAt: Date | null;
            updatedAt: Date;
        } | null;
    }[]>;
    findById(teamId: string): Promise<{
        members: {
            id: string;
            teamId: string;
            userId: string;
            role: string;
            status: string;
            invitedBy: string | null;
            joinedAt: Date | null;
            leftAt: Date | null;
            createdAt: Date;
            updatedAt: Date;
        }[];
        id: string;
        name: string;
        logoUrl: string | null;
        categoryId: string;
        communityId: string | null;
        status: string;
        createdBy: string;
        createdAt: Date;
        updatedAt: Date;
        archivedAt: Date | null;
    }>;
    findMember(teamId: string, userId: string): Promise<{
        id: string;
        teamId: string;
        userId: string;
        role: string;
        status: string;
        invitedBy: string | null;
        joinedAt: Date | null;
        leftAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    searchMemberCandidates(teamId: string, query: string, limit: number): Promise<{
        id: string;
        email: string;
        fullName: string | null;
        avatarUrl: string | null;
        membershipStatus: string | null;
    }[]>;
    update(teamId: string, dto: UpdateFootballTeamDto): Promise<{
        id: string;
        name: string;
        logoUrl: string | null;
        categoryId: string;
        communityId: string | null;
        status: string;
        createdBy: string;
        createdAt: Date;
        updatedAt: Date;
        archivedAt: Date | null;
    }>;
    invite(teamId: string, invitedBy: string, userId: string, role: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        userId: string;
        role: string;
        joinedAt: Date | null;
        invitedBy: string | null;
        teamId: string;
        leftAt: Date | null;
    }>;
    respond(teamId: string, userId: string, status: 'ACCEPTED' | 'DECLINED'): Promise<{
        id: string;
        teamId: string;
        userId: string;
        role: string;
        status: string;
        invitedBy: string | null;
        joinedAt: Date | null;
        leftAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    cancelInvite(teamId: string, userId: string): Promise<{
        id: string;
        teamId: string;
        userId: string;
        role: string;
        status: string;
        invitedBy: string | null;
        joinedAt: Date | null;
        leftAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    removeMember(teamId: string, userId: string, actorUserId: string): Promise<{
        id: string;
        teamId: string;
        userId: string;
        role: string;
        status: string;
        invitedBy: string | null;
        joinedAt: Date | null;
        leftAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    updateMember(teamId: string, userId: string, role: string, actorUserId: string): Promise<{
        id: string;
        teamId: string;
        userId: string;
        role: string;
        status: string;
        invitedBy: string | null;
        joinedAt: Date | null;
        leftAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    leave(teamId: string, userId: string): Promise<{
        id: string;
        teamId: string;
        userId: string;
        role: string;
        status: string;
        invitedBy: string | null;
        joinedAt: Date | null;
        leftAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
}
