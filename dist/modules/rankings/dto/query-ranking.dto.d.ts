import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
export declare class QueryRankingDto extends CursorPaginationDto {
    page?: number;
    limit?: number;
    categoryId: string;
    matchType?: string;
    scope?: 'PUBLIC' | 'COMMUNITY';
    communityId?: string;
    provinceCode?: string;
    genderRestriction?: string;
}
