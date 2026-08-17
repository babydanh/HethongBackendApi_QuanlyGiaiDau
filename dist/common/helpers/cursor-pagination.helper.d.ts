export declare class CursorPaginationHelper {
    static encodeCursor(payload: Record<string, unknown>): string;
    static decodeCursor<T = Record<string, unknown>>(cursor: string): T | null;
}
