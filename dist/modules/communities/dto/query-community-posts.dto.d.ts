import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
export declare class QueryCommunityPostsDto extends CursorPaginationDto {
    limit?: number;
    sort?: 'LATEST';
}
