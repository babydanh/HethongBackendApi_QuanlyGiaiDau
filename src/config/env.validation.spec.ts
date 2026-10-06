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
});
