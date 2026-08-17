export declare class CreateCommunityDto {
    name: string;
    description?: string;
    logoUrl?: string;
    bannerUrl?: string;
    locationAddress?: string;
    lat?: number;
    lng?: number;
    categoryIds?: string[];
    provinceCode: string;
    districtCode?: string;
    wardCode?: string;
    visibility?: 'PUBLIC' | 'PRIVATE' | 'RESTRICTED';
    joinMode?: 'OPEN' | 'APPROVAL' | 'INVITE_ONLY';
    joinQuestions?: string[];
    rules?: string;
    maxMembers?: number;
    socialLinks?: Record<string, string>;
}
