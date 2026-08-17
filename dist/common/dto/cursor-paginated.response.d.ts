export interface CursorPaginatedResponse<T> {
    data: T[];
    meta: {
        nextCursor: string | null;
        prevCursor?: string | null;
        hasMore: boolean;
        limit: number;
        totalCount?: number;
    };
}
