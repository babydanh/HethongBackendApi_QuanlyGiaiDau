import { MatchesService } from './matches.service';
import { QueryMatchDto } from './dto/query-match.dto';
import { OperateMatchDto } from './dto/operate-match.dto';
import { UpdateMatchScoreDto } from './dto/update-match-score.dto';
import { UpdateMatchStatusDto } from './dto/update-match-status.dto';
import { UpdateMatchScheduleDto } from './dto/update-match-schedule.dto';
import { CreateMatchCommentDto } from './dto/create-match-comment.dto';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
export declare class MatchesController {
    private readonly matchesService;
    constructor(matchesService: MatchesService);
    findAll(query: QueryMatchDto): Promise<any>;
    findOne(id: string): Promise<{
        refereeName: string | null;
        groupName: string;
        tournamentId: string;
        tournament: {
            id: string;
            name: string;
            tournamentType: string;
            status: string;
            visibility: string;
            isRanked: boolean;
            communityId: string | null;
            categoryId: string;
            categoryName: string | null;
            categorySlug: string | null;
            categoryConfig: unknown;
            matchType: string;
            genderRestriction: string | null;
            createdBy: string;
            sportRules: unknown;
            tournamentConfig: unknown;
            venueName: string | null;
            venueAddress: string | null;
        } | null;
        stage: {
            id: string;
            name: string;
            type: string;
            roundConfig: unknown;
        } | null;
        group: {
            id: string;
            name: string | null;
            roundConfig: unknown;
        } | null;
        participant1: {
            id: string;
            teamName: string;
            tournamentDivisionId: string | null;
            eloPoints: number | null;
            members: {
                userId: string;
                fullName: string | null;
                avatarUrl: string | null;
                elo?: {
                    eloPoints: number;
                } | undefined;
            }[];
        } | null;
        participant2: {
            id: string;
            teamName: string;
            tournamentDivisionId: string | null;
            eloPoints: number | null;
            members: {
                userId: string;
                fullName: string | null;
                avatarUrl: string | null;
                elo?: {
                    eloPoints: number;
                } | undefined;
            }[];
        } | null;
        id: string;
        groupId: string | null;
        stageId: string;
        participant1Id: string | null;
        participant2Id: string | null;
        winnerId: string | null;
        status: string;
        scoreDetails: unknown;
        p1SetsWon: number;
        p2SetsWon: number;
        totalSetsPlayed: number;
        revision: number;
        roundNumber: number;
        matchOrder: number;
        bracketBranch: string;
        isBye: boolean;
        leg: number | null;
        tieId: string | null;
        nextMatchId: string | null;
        loserNextMatchId: string | null;
        courtId: string | null;
        courtName: string | null;
        courtAddress: string | null;
        refereeId: string | null;
        scoreConfirmedBy: string | null;
        scoreConfirmedAt: Date | null;
        matchEvidenceImages: string[];
        scheduledAt: Date | null;
        matchConfig: unknown;
        startedAt: Date | null;
        completedAt: Date | null;
        updatedAt: Date;
        deletedAt: Date | null;
        cheerCount: number;
    }>;
    getComments(id: string): Promise<{
        id: string;
        matchId: string;
        commentText: string;
        createdAt: Date;
        user: {
            id: string | null;
            fullName: string | null;
            avatarUrl: string | null;
        };
    }[]>;
    createComment(id: string, createMatchCommentDto: CreateMatchCommentDto, user: JwtPayload): Promise<{
        id: string;
        matchId: string;
        commentText: string;
        createdAt: Date;
        user: {
            id: string | null;
            fullName: string | null;
            avatarUrl: string | null;
        };
    }>;
    updateScore(id: string, updateMatchScoreDto: UpdateMatchScoreDto, user: JwtPayload): Promise<any>;
    updateStatus(id: string, updateMatchStatusDto: UpdateMatchStatusDto, user: JwtPayload): Promise<any>;
    updateSchedule(id: string, updateMatchScheduleDto: UpdateMatchScheduleDto, user: JwtPayload): Promise<{
        id: string;
        groupId: string | null;
        tournamentId: string;
        stageId: string;
        participant1Id: string | null;
        participant2Id: string | null;
        winnerId: string | null;
        status: string;
        scoreDetails: unknown;
        p1SetsWon: number;
        p2SetsWon: number;
        totalSetsPlayed: number;
        revision: number;
        roundNumber: number;
        matchOrder: number;
        bracketBranch: string;
        isBye: boolean;
        leg: number | null;
        tieId: string | null;
        nextMatchId: string | null;
        loserNextMatchId: string | null;
        courtId: string | null;
        courtName: string | null;
        courtAddress: string | null;
        refereeId: string | null;
        scoreConfirmedBy: string | null;
        scoreConfirmedAt: Date | null;
        matchEvidenceImages: string[];
        scheduledAt: Date | null;
        matchConfig: unknown;
        startedAt: Date | null;
        completedAt: Date | null;
        updatedAt: Date;
        deletedAt: Date | null;
        cheerCount: number;
    } | undefined>;
    operateMatch(id: string, operateMatchDto: OperateMatchDto, user: JwtPayload): Promise<any>;
    assignReferee(id: string, body: {
        refereeId: string;
    }, user: JwtPayload): Promise<{
        id: string;
        groupId: string | null;
        tournamentId: string;
        stageId: string;
        participant1Id: string | null;
        participant2Id: string | null;
        winnerId: string | null;
        status: string;
        scoreDetails: unknown;
        p1SetsWon: number;
        p2SetsWon: number;
        totalSetsPlayed: number;
        revision: number;
        roundNumber: number;
        matchOrder: number;
        bracketBranch: string;
        isBye: boolean;
        leg: number | null;
        tieId: string | null;
        nextMatchId: string | null;
        loserNextMatchId: string | null;
        courtId: string | null;
        courtName: string | null;
        courtAddress: string | null;
        refereeId: string | null;
        scoreConfirmedBy: string | null;
        scoreConfirmedAt: Date | null;
        matchEvidenceImages: string[];
        scheduledAt: Date | null;
        matchConfig: unknown;
        startedAt: Date | null;
        completedAt: Date | null;
        updatedAt: Date;
        deletedAt: Date | null;
        cheerCount: number;
    } | undefined>;
    muteUser(id: string, body: {
        userId: string;
        type: 'MUTE' | 'BAN';
        reason?: string;
    }, user: JwtPayload): Promise<{
        message: string;
    }>;
    unmuteUser(id: string, userId: string, user: JwtPayload): Promise<{
        message: string;
    }>;
    getMutedUsers(id: string, user: JwtPayload): Promise<{
        id: string;
        userId: string;
        type: string;
        reason: string | null;
        expiresAt: Date | null;
        createdAt: Date;
        mutedBy: string | null;
        fullName: string | null;
        avatarUrl: string | null;
    }[]>;
    cheerMatch(id: string): Promise<{
        cheerCount: number;
    }>;
    getCheerCount(id: string): Promise<{
        cheerCount: number;
    }>;
}
