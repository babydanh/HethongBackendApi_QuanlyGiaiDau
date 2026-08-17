"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExclusionRuleException = void 0;
const common_1 = require("@nestjs/common");
const base_exception_1 = require("../../../common/exceptions/base.exception");
class ExclusionRuleException extends base_exception_1.BaseException {
    constructor(message) {
        super(message || 'Bạn đã nhận Vé Thẳng và bị khóa không được đăng ký tiếp chặng giải đấu này.', 'EXCLUSION_RULE_VIOLATION', common_1.HttpStatus.BAD_REQUEST);
    }
}
exports.ExclusionRuleException = ExclusionRuleException;
//# sourceMappingURL=exclusion-rule.exception.js.map