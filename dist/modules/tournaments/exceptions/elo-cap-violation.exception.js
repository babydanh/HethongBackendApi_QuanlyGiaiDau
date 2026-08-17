"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EloCapViolationException = void 0;
const common_1 = require("@nestjs/common");
const base_exception_1 = require("../../../common/exceptions/base.exception");
class EloCapViolationException extends base_exception_1.BaseException {
    constructor(message, details) {
        super(message || 'Điểm ELO của người chơi không hợp lệ với yêu cầu của giải đấu.', 'ELO_CAP_VIOLATION', common_1.HttpStatus.BAD_REQUEST, details);
    }
}
exports.EloCapViolationException = EloCapViolationException;
//# sourceMappingURL=elo-cap-violation.exception.js.map