import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
export declare class QueryNotificationsDto extends CursorPaginationDto {
    page?: number;
    limit?: number;
    isRead?: boolean;
}
