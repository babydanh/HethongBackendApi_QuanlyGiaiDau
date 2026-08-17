import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MatchBroadcastData } from './interfaces/match-broadcast.interface';
export declare class LiveScoreGateway implements OnGatewayConnection, OnGatewayDisconnect {
    server: Server;
    private readonly logger;
    private readonly clientMatchRooms;
    private readonly clientTournamentRooms;
    private readonly pendingViewerUpdates;
    private batchInterval;
    private viewerSyncInterval;
    private metricsInterval;
    private readonly loopMonitor;
    constructor();
    onApplicationShutdown(): void;
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    private getViewerCount;
    handleJoinMatch(matchId: string, client: Socket): {
        event: string;
        data: string;
    };
    handleLeaveMatch(matchId: string, client: Socket): {
        event: string;
        data: string;
    };
    handleJoinTournament(tournamentId: string, client: Socket): {
        event: string;
        data: string;
    };
    handleLeaveTournament(tournamentId: string, client: Socket): {
        event: string;
        data: string;
    };
    broadcastScoreUpdate(matchId: string, matchData: MatchBroadcastData, tournamentId?: string | null): void;
    broadcastMatchStatus(matchId: string, matchData: MatchBroadcastData, tournamentId?: string | null): void;
    broadcastRegistrationUpdate(tournamentId: string, payload: {
        participantId?: string;
        divisionId?: string | null;
        action: string;
    }): void;
    private flushViewerCounts;
    private broadcastAllViewerCounts;
    broadcastComment(matchId: string, comment: unknown): void;
    broadcastCheerUpdate(matchId: string, cheerCount: number): void;
    private broadcastSystemMetrics;
}
