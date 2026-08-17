import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
export declare class QueryCommunityDto extends CursorPaginationDto {
    page?: number;
    limit?: number;
    search?: string;
    all?: boolean | string;
    status?: string;
    lat?: number;
    lng?: number;
    radiusKm?: number;
    region?: string;
    categoryId?: string;
    provinceCode?: string;
}
