import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
export declare class QueryStandingsDto extends CursorPaginationDto {
    legId: string;
    categoryId?: string;
    page?: number;
    limit?: number;
}
