import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
export declare class QueryMatchDto extends CursorPaginationDto {
    page?: number;
    groupId?: string;
    status?: string;
    tournamentId?: string;
    tournament_id?: string;
    divisionId?: string;
    division_id?: string;
    categoryId?: string;
    category_id?: string;
    userId?: string;
    publicOnly?: boolean;
    isPublicOnly?: boolean;
    bracketType?: 'SINGLE_ELIMINATION' | 'DOUBLE_ELIMINATION' | 'ROUND_ROBIN' | 'GROUP_STAGE_KNOCKOUT';
    startDate?: string;
    endDate?: string;
    genderRestriction?: string;
    matchType?: string;
    city?: string;
    isRanked?: boolean;
}
