import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { TournamentsService } from '../tournaments/tournaments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MatchesService } from '../matches/matches.service';
import { PaymentsService } from '../payments/payments.service';
import { RankingsService } from '../rankings/rankings.service';
export declare class AiService {
    private readonly configService;
    private readonly tournamentsService;
    private readonly notificationsService;
    private readonly matchesService;
    private readonly paymentsService;
    private readonly rankingsService;
    private readonly logger;
    private openai;
    private modelName;
    private baseSystemPrompt;
    constructor(configService: ConfigService, tournamentsService: TournamentsService, notificationsService: NotificationsService, matchesService: MatchesService, paymentsService: PaymentsService, rankingsService: RankingsService);
    private loadBaseSystemPrompt;
    private extractTournamentId;
    private buildUserContext;
    private getFallbackSystemPrompt;
    private buildSystemPromptWithContext;
    private buildOpenAiMessages;
    getChatResponse(messages: any[], userId?: string, currentUrl?: string, pageTitle?: string, isMobile?: boolean, searchParams?: string): Promise<string>;
    getChatResponseStream(messages: any[], userId?: string, currentUrl?: string, pageTitle?: string, isMobile?: boolean, searchParams?: string): Promise<import("openai/core/streaming.js").Stream<OpenAI.Chat.Completions.ChatCompletionChunk> & {
        _request_id?: string | null;
    }>;
    parseTournamentSource(dto: {
        sourceUrl?: string;
        rawText?: string;
        sportHint?: string;
    }): Promise<{
        name: string;
        sport: 'badminton' | 'tennis' | 'pickleball' | 'table_tennis' | 'football';
        startDate?: string | null;
        endDate?: string | null;
        venueName?: string | null;
        locationAddress?: string | null;
        province?: string | null;
        description?: string | null;
        bannerUrl?: string | null;
        formats: Array<{
            name: string;
            formatKey: string;
            bracketType?: 'SINGLE_ELIMINATION' | 'DOUBLE_ELIMINATION' | 'ROUND_ROBIN' | 'GROUP_STAGE_KNOCKOUT' | null;
            maxParticipants?: number | null;
            minElo?: number | null;
            maxElo?: number | null;
        }>;
    }>;
}
