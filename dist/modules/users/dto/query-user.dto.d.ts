import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { UserRole } from '../../../common/constants/enums';
export declare enum AdminUserStatusFilter {
    ACTIVE = "ACTIVE",
    BANNED = "BANNED"
}
export declare class QueryUserDto extends CursorPaginationDto {
    page?: number;
    limit?: number;
    search?: string;
    sort?: string;
    order?: 'asc' | 'desc';
    role?: UserRole;
    status?: AdminUserStatusFilter;
    from?: string;
    to?: string;
}
