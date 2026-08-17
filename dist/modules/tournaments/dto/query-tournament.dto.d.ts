import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
export declare class QueryTournamentDto extends CursorPaginationDto {
    page?: number;
    limit?: number;
    search?: string;
    categoryId?: string;
    status?: string;
    tournamentType?: 'CLUB' | 'PUBLIC';
    matchType?: 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES';
    communityId?: string;
    visibility?: 'PUBLIC' | 'PRIVATE';
    region?: string;
    createdBy?: string;
    startDate?: string;
    endDate?: string;
    bracketType?: 'SINGLE_ELIMINATION' | 'DOUBLE_ELIMINATION' | 'ROUND_ROBIN' | 'GROUP_STAGE_KNOCKOUT';
    genderRestriction?: 'MALE' | 'FEMALE' | 'MIXED';
    isRanked?: boolean;
}
