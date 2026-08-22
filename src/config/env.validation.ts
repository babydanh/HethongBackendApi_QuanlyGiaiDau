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
  FRONTEND_URL: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string()
      .uri({ scheme: ['https'] })
      .required(),
    otherwise: Joi.string().uri().default('http://localhost:3001'),
  }),
  APP_API_KEY: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(16).required(),
    otherwise: Joi.string().allow('').optional().default(''),
  }),
  OPENROUTER_API_KEY: Joi.string().allow('').optional().default(''),
  OPENROUTER_BASE_URL: Joi.string()
    .uri()
    .default('https://openrouter.ai/api/v1'),
  AI_MODEL: Joi.string().default('meta-llama/llama-3-8b-instruct:free'),
  PAYOS_CLIENT_ID: Joi.string().allow('').optional().default(''),
  PAYOS_API_KEY: Joi.string().allow('').optional().default(''),
  PAYOS_CHECKSUM_KEY: Joi.string().allow('').optional().default(''),
  LIVESTREAM_RTMP_BASE_URL: Joi.string()
    .allow('')
    .optional()
    .default('rtmp://localhost:1935/live'),
  LIVESTREAM_HLS_PUBLIC_BASE_URL: Joi.string()
    .allow('')
    .optional()
    .default('http://localhost:8888/live'),
  LIVESTREAM_SRT_BASE_URL: Joi.string()
    .allow('')
    .optional()
    .default('srt://localhost:8890'),
  MEDIA_PUBLIC_BASE_URL: Joi.string().allow('').optional().default(''),
  MEDIA_RTMP_BASE_URL: Joi.string().allow('').optional().default(''),
  MEDIA_SRT_BASE_URL: Joi.string().allow('').optional().default(''),
  MEDIA_WEBHOOK_SECRET: Joi.string().allow('').optional().default(''),
  FACEBOOK_APP_ID: Joi.string().allow('').optional().default(''),
  FACEBOOK_APP_SECRET: Joi.string().allow('').optional().default(''),
  FACEBOOK_OAUTH_REDIRECT_URI: Joi.string()
    .uri()
    .allow('')
    .optional()
    .default(''),
  FACEBOOK_GRAPH_API_VERSION: Joi.string()
    .pattern(/^v\d+\.\d+$/)
    .default('v23.0'),
  FACEBOOK_GRAPH_API_BASE_URL: Joi.string()
    .uri()
    .default('https://graph.facebook.com'),
  FACEBOOK_GRAPH_REQUEST_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1000)
    .max(30000)
    .default(10000),
  FACEBOOK_GRAPH_GET_RETRY_ATTEMPTS: Joi.number()
    .integer()
    .min(1)
    .max(3)
    .default(3),
  FACEBOOK_PAGE_TOKEN_ENCRYPTION_KEY: Joi.string()
    .allow('')
    .optional()
    .default(''),
  FACEBOOK_PUBLISH_CONFIG_TTL_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(3600)
    .default(900),
});
