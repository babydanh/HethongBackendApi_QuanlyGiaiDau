export declare class CreateTournamentDto {
    tournamentType: 'CLUB' | 'PUBLIC';
    matchType?: 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES';
    bannerUrl?: string;
    logoUrl?: string;
    galleryImages?: string[];
    registrationStartDate?: string;
    registrationEndDate?: string;
    maxParticipants?: number;
    prizeDescription?: string;
    prizes?: Record<string, unknown>[];
    contactInfo?: Record<string, string>;
    visibility?: 'PUBLIC' | 'PRIVATE';
    genderRestriction?: 'MALE' | 'FEMALE' | 'MIXED' | null;
    name: string;
    categoryId: string;
    communityId?: string;
    description?: string;
    sportRules?: Record<string, unknown>;
    tournamentConfig: Record<string, unknown>;
    entryFee?: number;
    platformFeePercentage?: number;
    startDate?: string;
    endDate?: string;
    venueId?: string;
    parentId?: string;
    city?: string;
    isRanked?: boolean;
}
