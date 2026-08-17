"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.envValidationSchema = void 0;
const Joi = __importStar(require("joi"));
exports.envValidationSchema = Joi.object({
    PORT: Joi.number().default(3000),
    NODE_ENV: Joi.string()
        .valid('development', 'production', 'test')
        .default('development'),
    DB_HOST: Joi.string().required(),
    DB_PORT: Joi.number().default(5432),
    DB_USERNAME: Joi.string().required(),
    DB_PASSWORD: Joi.string().required(),
    DB_DATABASE: Joi.string().required(),
    DB_SSL: Joi.string().valid('true', 'false').default('false'),
    JWT_ACCESS_SECRET: Joi.string().required(),
    JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
    JWT_REFRESH_SECRET: Joi.string().required(),
    JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
    REDIS_HOST: Joi.string().required(),
    REDIS_PORT: Joi.number().default(6379),
    FRONTEND_URL: Joi.when('NODE_ENV', {
        is: 'production',
        then: Joi.string().uri({ scheme: ['https'] }).required(),
        otherwise: Joi.string().uri().default('http://localhost:3001'),
    }),
    OPENROUTER_API_KEY: Joi.string().allow('').optional().default(''),
    OPENROUTER_BASE_URL: Joi.string().uri().default('https://openrouter.ai/api/v1'),
    AI_MODEL: Joi.string().default('meta-llama/llama-3-8b-instruct:free'),
    PAYOS_CLIENT_ID: Joi.string().allow('').optional().default(''),
    PAYOS_API_KEY: Joi.string().allow('').optional().default(''),
    PAYOS_CHECKSUM_KEY: Joi.string().allow('').optional().default(''),
    LIVESTREAM_RTMP_BASE_URL: Joi.string().allow('').optional().default('rtmp://localhost:1935/live'),
    LIVESTREAM_HLS_PUBLIC_BASE_URL: Joi.string().allow('').optional().default('http://localhost:8888/live'),
    LIVESTREAM_SRT_BASE_URL: Joi.string().allow('').optional().default('srt://localhost:8890'),
    MEDIA_PUBLIC_BASE_URL: Joi.string().allow('').optional().default(''),
    MEDIA_RTMP_BASE_URL: Joi.string().allow('').optional().default(''),
    MEDIA_SRT_BASE_URL: Joi.string().allow('').optional().default(''),
    MEDIA_WEBHOOK_SECRET: Joi.string().allow('').optional().default(''),
});
//# sourceMappingURL=env.validation.js.map