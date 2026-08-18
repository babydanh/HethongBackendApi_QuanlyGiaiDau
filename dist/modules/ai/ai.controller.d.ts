import { AiService } from './ai.service';
import type { Request, Response } from 'express';
export declare class AiController {
    private readonly aiService;
    constructor(aiService: AiService);
    private getUserIdFromRequest;
    chat(messages: any[], currentUrl: string, pageTitle: string, isMobile: boolean, searchParams: string, req: Request, res: Response): Promise<void>;
    message(messages: any[], singleMessage: string, currentUrl: string, pageTitle: string, isMobile: boolean, searchParams: string, req: Request): Promise<{
        success: boolean;
        reply: string;
        data: string;
    }>;
    parseTournamentSource(sourceUrl?: string, rawText?: string, sportHint?: string): Promise<{
        success: boolean;
        data: {
            name: string;
            sport: "badminton" | "tennis" | "pickleball" | "table_tennis" | "football";
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
                bracketType?: "SINGLE_ELIMINATION" | "DOUBLE_ELIMINATION" | "ROUND_ROBIN" | "GROUP_STAGE_KNOCKOUT" | null;
                maxParticipants?: number | null;
                minElo?: number | null;
                maxElo?: number | null;
            }>;
        };
    }>;
}
