import { registerAs } from '@nestjs/config';

/** Default OpenRouter text model; `AI_MODEL` in the environment overrides it. */
export const DEFAULT_AI_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';

/**
 * OpenRouter `reasoning` switch for structured-output calls. The default model reasons before it
 * answers (on by default, not mandatory); reasoning tokens count against `max_tokens` and the
 * caller's deadline, so a short JSON task could come back empty. Chat keeps the model default.
 */
export const NO_REASONING = { reasoning: { enabled: false } } as const;

export default registerAs('ai', () => ({
  apiKey: process.env.OPENROUTER_API_KEY || '',
  baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  modelName: process.env.AI_MODEL || DEFAULT_AI_MODEL,
  // Keep vision separate: the default text model is not assumed to accept image inputs.
  visionModelName: process.env.AI_VISION_MODEL || '',
}));
