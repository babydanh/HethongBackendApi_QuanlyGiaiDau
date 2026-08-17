"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("@nestjs/config");
exports.default = (0, config_1.registerAs)('ai', () => ({
    apiKey: process.env.OPENROUTER_API_KEY || '',
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    modelName: process.env.AI_MODEL || 'meta-llama/llama-3-8b-instruct:free',
}));
//# sourceMappingURL=ai.config.js.map