import { validate } from 'class-validator';
import { StandalonePlaybackSettingsDto } from './standalone-playback-settings.dto';

describe('StandalonePlaybackSettingsDto', () => {
  it('accepts HTTPS and explicit null values for clearing settings', async () => {
    const valid = Object.assign(new StandalonePlaybackSettingsDto(), {
      playbackUrl: 'https://media.example/live/index.m3u8',
      cameraName: 'Court 1',
    });
    const clear = Object.assign(new StandalonePlaybackSettingsDto(), {
      playbackUrl: null,
      cameraName: null,
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    await expect(validate(clear)).resolves.toHaveLength(0);
  });

  it('accepts URL and camera name at their maximum lengths', async () => {
    const prefix = 'https://media.example/';
    const boundary = Object.assign(new StandalonePlaybackSettingsDto(), {
      playbackUrl: prefix + 'a'.repeat(2000 - prefix.length),
      cameraName: 'x'.repeat(255),
    });

    await expect(validate(boundary)).resolves.toHaveLength(0);
  });

  it('rejects non-HTTPS URLs and values beyond field limits', async () => {
    const invalid = Object.assign(new StandalonePlaybackSettingsDto(), {
      playbackUrl: `http://${'a'.repeat(2000)}`,
      cameraName: 'x'.repeat(256),
    });

    const errors = await validate(invalid);

    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining(['playbackUrl', 'cameraName']),
    );
  });
});
