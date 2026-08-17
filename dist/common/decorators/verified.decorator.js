"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Verified = exports.VERIFIED_KEY = void 0;
const common_1 = require("@nestjs/common");
exports.VERIFIED_KEY = 'isVerified';
const Verified = () => (0, common_1.SetMetadata)(exports.VERIFIED_KEY, true);
exports.Verified = Verified;
//# sourceMappingURL=verified.decorator.js.map