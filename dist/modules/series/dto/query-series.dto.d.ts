import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
export declare class QuerySeriesDto extends CursorPaginationDto {
    page?: number;
    limit?: number;
    search?: string;
    status?: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
    visibility?: 'PUBLIC' | 'PRIVATE';
    organizerId?: string;
}
