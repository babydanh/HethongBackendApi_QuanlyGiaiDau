"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserNotFoundException = void 0;
const common_1 = require("@nestjs/common");
const base_exception_1 = require("../../../common/exceptions/base.exception");
class UserNotFoundException extends base_exception_1.BaseException {
    constructor(identifier) {
        const message = identifier
            ? `Không tìm thấy người dùng có thông tin: ${identifier}`
            : 'Không tìm thấy người dùng.';
        super(message, 'USER_NOT_FOUND', common_1.HttpStatus.NOT_FOUND, identifier ? { identifier } : undefined);
    }
}
exports.UserNotFoundException = UserNotFoundException;
//# sourceMappingURL=user-not-found.exception.js.map