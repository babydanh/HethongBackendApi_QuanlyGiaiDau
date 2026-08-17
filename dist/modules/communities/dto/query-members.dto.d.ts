import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
export declare class QueryMembersDto extends CursorPaginationDto {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    mentionable?: boolean;
}
