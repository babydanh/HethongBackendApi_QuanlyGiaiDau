import { registerAs } from '@nestjs/config';

export default registerAs('ai', () => ({
  apiKey: process.env.OPENROUTER_API_KEY || '',
  baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  modelName: process.env.AI_MODEL || 'meta-llama/llama-3-8b-instruct:free',
  // Keep vision separate: the default text model is not assumed to accept image inputs.
  visionModelName: process.env.AI_VISION_MODEL || '',
}));
