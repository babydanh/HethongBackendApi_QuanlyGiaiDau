import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
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
  FRONTEND_URL: Joi.string().uri().optional(),
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
