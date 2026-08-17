"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseException = void 0;
const common_1 = require("@nestjs/common");
class BaseException extends common_1.HttpException {
    code;
    details;
    constructor(message, code, status, details) {
        super({
            message,
            code,
            details,
        }, status);
        this.code = code;
        this.details = details;
        this.name = this.constructor.name;
    }
}
exports.BaseException = BaseException;
//# sourceMappingURL=base.exception.js.map