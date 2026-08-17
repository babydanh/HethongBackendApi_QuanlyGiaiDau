import { CreateFootballTeamDto } from './dto/create-football-team.dto';
import { InviteFootballTeamMemberDto } from './dto/invite-football-team-member.dto';
import { RespondFootballTeamInviteDto } from './dto/respond-football-team-invite.dto';
import { UpdateFootballTeamDto } from './dto/update-football-team.dto';
import { UpdateFootballTeamMemberDto } from './dto/update-football-team-member.dto';
import { FootballTeamsService } from './football-teams.service';
import { QueryFootballTeamMemberCandidatesDto } from './dto/query-football-team-member-candidates.dto';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
export declare class FootballTeamsController {
    private readonly service;
    constructor(service: FootballTeamsService);
    create(user: JwtPayload, dto: CreateFootballTeamDto): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        categoryId: string;
        logoUrl: string | null;
        status: string;
        communityId: string | null;
        createdBy: string;
        archivedAt: Date | null;
    }>;
    listMine(user: JwtPayload): Promise<{
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
    get(id: string): Promise<{
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
    update(user: JwtPayload, id: string, dto: UpdateFootballTeamDto): Promise<{
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
    searchMemberCandidates(user: JwtPayload, id: string, query: QueryFootballTeamMemberCandidatesDto): Promise<{
        id: string;
        email: string;
        fullName: string | null;
        avatarUrl: string | null;
        membershipStatus: string | null;
    }[]>;
    invite(user: JwtPayload, id: string, dto: InviteFootballTeamMemberDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        status: string;
        role: string;
        invitedBy: string | null;
        joinedAt: Date | null;
        teamId: string;
        leftAt: Date | null;
    }>;
    respond(user: JwtPayload, id: string, dto: RespondFootballTeamInviteDto): Promise<{
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
    cancelInvite(user: JwtPayload, id: string, targetUserId: string): Promise<{
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
    updateMember(user: JwtPayload, id: string, targetUserId: string, dto: UpdateFootballTeamMemberDto): Promise<{
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
    leave(user: JwtPayload, id: string): Promise<{
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
    removeMember(user: JwtPayload, id: string, targetUserId: string): Promise<{
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
