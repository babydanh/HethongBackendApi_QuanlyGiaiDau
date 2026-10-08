import { envValidationSchema } from './env.validation';

const requiredEnvironment = {
  NODE_ENV: 'test',
  DB_HOST: 'localhost',
  DB_USERNAME: 'postgres',
  DB_PASSWORD: 'test-password',
  DB_DATABASE: 'tournament_test',
  JWT_ACCESS_SECRET: 'test-access-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret',
  REDIS_HOST: 'localhost',
};

describe('AQVision environment configuration', () => {
  it('defaults to the documented API base URL and an empty secret', () => {
    const { error, value } = envValidationSchema.validate(requiredEnvironment);

    expect(error).toBeUndefined();
    expect(value.AQVISION_API_BASE_URL).toBe('https://api.media.aqvision.net');
    expect(value.AQVISION_API_SECRET).toBe('');
  });

  it('accepts an explicitly empty API secret', () => {
    const { error } = envValidationSchema.validate({
      ...requiredEnvironment,
      AQVISION_API_SECRET: '',
    });

    expect(error).toBeUndefined();
  });

  it('rejects a non-HTTPS API base URL as a URL validation error', () => {
    const { error } = envValidationSchema.validate({
      ...requiredEnvironment,
      AQVISION_API_BASE_URL: 'http://api.media.aqvision.net',
    });
    const issue = error?.details.find(
      (detail) => detail.path[0] === 'AQVISION_API_BASE_URL',
    );

    expect(issue?.type).toMatch(/^string\./);
  });

  /**
   * `.env.example` ships the AQP push values as BLANK lines, so an operator who
   * copies them into the VPS `.env` gets `AQVISION_PUSH_PORT=` — an empty
   * string. A plain `Joi.number()` rejects that and the container crash-loops
   * ("Config validation error: AQVISION_PUSH_PORT must be a number"), which
   * takes the whole API down. Blank must mean "not configured" and be caught
   * later by the fail-closed path in aqvision-publish.service, not at boot.
   */
  it('accepts blank AQP push host/ports exactly as .env.example ships them', () => {
    const { error, value } = envValidationSchema.validate({
      ...requiredEnvironment,
      AQVISION_PUSH_HOST: '',
      AQVISION_PUSH_PORT: '',
      AQVISION_PUSH_RTMP_PORT: '',
    });

    expect(error).toBeUndefined();
    // Falsy ⇒ resolvePushEndpoint/resolveRtmpPushEndpoint hand '' to the QR
    // builder, which throws and surfaces as 503 instead of a QR without
    // credentials.
    expect(value.AQVISION_PUSH_PORT).toBe('');
    expect(value.AQVISION_PUSH_RTMP_PORT).toBe('');
  });

  it('still rejects a non-numeric port so a typo is caught at boot', () => {
    const { error } = envValidationSchema.validate({
      ...requiredEnvironment,
      AQVISION_PUSH_PORT: 'not-a-port',
    });

    expect(error?.details.some((d) => d.path[0] === 'AQVISION_PUSH_PORT')).toBe(true);
  });
});
