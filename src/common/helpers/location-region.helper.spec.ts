import { classifyLocationRegion } from './location-region.helper';

describe('location region classifier', () => {
  it('treats a selected Vietnam province as Vietnam', () => {
    expect(classifyLocationRegion({ provinceCode: '79', locationText: 'D-Sport Quận 7' })).toBe('VIETNAM');
  });

  it('recognizes explicit foreign country names', () => {
    expect(classifyLocationRegion({ locationText: 'Singapore Indoor Stadium' })).toBe('FOREIGN');
  });

  it('does not trust a non-Vietnam province code as Vietnam', () => {
    expect(classifyLocationRegion({ provinceCode: 'SG', locationText: 'Indoor Stadium' })).toBe('OTHER');
  });

  it('keeps missing or unknown locations in Other', () => {
    expect(classifyLocationRegion({ locationText: 'Sân thể thao chưa cập nhật' })).toBe('OTHER');
  });
});
