export declare class PsrPointConfigDto {
    pointsByRank: Record<number, number>;
    directEntryThreshold: number;
    wildcardCount: number;
    exclusionRule: boolean;
    exclusionScope: 'CATEGORY' | 'ALL';
    description: string;
}
export declare class CreateSeriesDto {
    name: string;
    slug: string;
    description?: string;
    bannerUrl?: string;
    logoUrl?: string;
    startDate?: string;
    endDate?: string;
    totalPrize?: number;
    rules: PsrPointConfigDto;
    visibility?: 'PUBLIC' | 'PRIVATE';
}
