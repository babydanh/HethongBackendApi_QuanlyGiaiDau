"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CursorPaginationHelper = void 0;
class CursorPaginationHelper {
    static encodeCursor(payload) {
        const stringified = JSON.stringify(payload);
        return Buffer.from(stringified).toString('base64');
    }
    static decodeCursor(cursor) {
        if (!cursor)
            return null;
        try {
            const stringified = Buffer.from(cursor, 'base64').toString('utf-8');
            return JSON.parse(stringified);
        }
        catch (e) {
            return null;
        }
    }
}
exports.CursorPaginationHelper = CursorPaginationHelper;
//# sourceMappingURL=cursor-pagination.helper.js.map