"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkipAppKey = exports.SKIP_APP_KEY = void 0;
const common_1 = require("@nestjs/common");
exports.SKIP_APP_KEY = 'skipAppKey';
const SkipAppKey = () => (0, common_1.SetMetadata)(exports.SKIP_APP_KEY, true);
exports.SkipAppKey = SkipAppKey;
//# sourceMappingURL=skip-app-key.decorator.js.map