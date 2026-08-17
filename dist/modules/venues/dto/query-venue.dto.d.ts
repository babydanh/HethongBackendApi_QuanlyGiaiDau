import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
export declare class QueryVenueDto extends CursorPaginationDto {
    page?: number;
    limit?: number;
    search?: string;
}
