export declare class DashboardPlayerDto {
    id: string;
    fullName: string;
    avatarUrl: string | null;
}
export declare class RecentMatchDto {
    id: string;
    playerA: DashboardPlayerDto | null;
    playerB: DashboardPlayerDto | null;
    scoreA: number;
    scoreB: number;
    status: string;
    eloDelta: number;
    playedAt: Date | null;
}
export declare class FeaturedTournamentDto {
    id: string;
    name: string;
    status: string;
    participantCount: number;
    championName: string | null;
}
export declare class TopPlayerDto {
    userId: string;
    fullName: string;
    avatarUrl: string | null;
    elo: number;
    tierName: string | null;
    rank: number;
    winStreak: number;
}
export declare class ActivityItemDto {
    type: 'MEMBER_JOINED' | 'GALLERY_ADDED' | 'TOURNAMENT_CREATED';
    userId: string | null;
    userName: string;
    message: string;
    at: Date;
}
export declare class UpcomingMatchDto {
    id: string;
    playerA: DashboardPlayerDto | null;
    playerB: DashboardPlayerDto | null;
    scheduledAt: Date | null;
}
export declare class DashboardResponseDto {
    recentMatches: RecentMatchDto[];
    featuredTournament: FeaturedTournamentDto | null;
    topPlayers: TopPlayerDto[];
    activity: ActivityItemDto[];
    upcomingMatches: UpcomingMatchDto[];
}
