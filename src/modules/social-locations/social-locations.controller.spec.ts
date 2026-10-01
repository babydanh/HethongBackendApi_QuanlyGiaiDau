import 'reflect-metadata';
import { SocialLocationsController } from './social-locations.controller';

describe('SocialLocationsController throttling', () => {
  it('sets an enforceable default limit on all location routes', () => {
    expect(
      Reflect.getMetadata('THROTTLER:LIMITdefault', SocialLocationsController),
    ).toBe(60);
    expect(
      Reflect.getMetadata('THROTTLER:TTLdefault', SocialLocationsController),
    ).toBe(30000);
  });
});
