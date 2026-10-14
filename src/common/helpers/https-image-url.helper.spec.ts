import { normalizeHttpsImageUrl } from './https-image-url.helper';

describe('normalizeHttpsImageUrl', () => {
  it('keeps a plain https image url', () => {
    expect(normalizeHttpsImageUrl('https://cdn.example.test/a.png')).toBe(
      'https://cdn.example.test/a.png',
    );
  });

  it('drops anything that is not https, so a preview never hands the browser a mixed-content image', () => {
    expect(normalizeHttpsImageUrl('http://cdn.example.test/a.png')).toBeNull();
    expect(normalizeHttpsImageUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeHttpsImageUrl('data:image/png;base64,AAAA')).toBeNull();
  });

  it('drops a url that carries credentials', () => {
    expect(
      normalizeHttpsImageUrl('https://user:secret@cdn.example.test/a.png'),
    ).toBeNull();
  });

  it('returns null for empty, missing or unparsable values', () => {
    expect(normalizeHttpsImageUrl(null)).toBeNull();
    expect(normalizeHttpsImageUrl(undefined)).toBeNull();
    expect(normalizeHttpsImageUrl('')).toBeNull();
    expect(normalizeHttpsImageUrl('not a url')).toBeNull();
  });
});
