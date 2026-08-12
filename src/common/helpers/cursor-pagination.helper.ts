export class CursorPaginationHelper {
  /**
   * Mã hoá (encode) đối tượng thành chuỗi cursor base64
   * @param payload Bất kỳ object nào (VD: { id: string, createdAt: Date })
   * @returns Chuỗi base64
   */
  static encodeCursor(payload: Record<string, unknown>): string {
    const stringified = JSON.stringify(payload);
    return Buffer.from(stringified).toString('base64');
  }

  /**
   * Giải mã (decode) chuỗi cursor base64 về object
   * @param cursor Chuỗi base64
   * @returns Object hoặc null nếu lỗi
   */
  static decodeCursor<T = Record<string, unknown>>(cursor: string): T | null {
    if (!cursor) return null;
    try {
      const stringified = Buffer.from(cursor, 'base64').toString('utf-8');
      return JSON.parse(stringified) as T;
    } catch (e) {
      return null;
    }
  }
}
