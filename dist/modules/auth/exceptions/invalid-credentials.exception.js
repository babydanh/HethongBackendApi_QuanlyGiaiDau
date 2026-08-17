"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidCredentialsException = void 0;
const common_1 = require("@nestjs/common");
const base_exception_1 = require("../../../common/exceptions/base.exception");
class InvalidCredentialsException extends base_exception_1.BaseException {
    constructor() {
        super('Mật khẩu hoặc email không chính xác.', 'INVALID_CREDENTIALS', common_1.HttpStatus.UNAUTHORIZED);
    }
}
exports.InvalidCredentialsException = InvalidCredentialsException;
//# sourceMappingURL=invalid-credentials.exception.js.map