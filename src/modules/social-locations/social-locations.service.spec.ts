import { ConfigService } from '@nestjs/config';
import { SocialLocationsService } from './social-locations.service';
import { PhotonProvider } from './photon.provider';
import { RegionsService } from '../regions/regions.service';

const feature = {
  properties: {
    name: 'MK Building',
    housenumber: '1',
    street: 'Lữ Gia',
    city: 'Hồ Chí Minh',
    country: 'Việt Nam',
  },
  geometry: { coordinates: [106.657, 10.762] },
};

describe('SocialLocationsService', () => {
  let service: SocialLocationsService;
  const originalFetch = global.fetch;

  beforeEach(() => {
  const provider = new PhotonProvider({
    get: (key: string) => key === 'PHOTON_BASE_URL' ? 'http://photon.internal:2322' : undefined,
  } as unknown as ConfigService);
  service = new SocialLocationsService(provider, {
    resolveByPoint: jest.fn().mockResolvedValue(null),
    matchProviderNames: jest.fn().mockResolvedValue({ provinceCode: null, wardCode: null }),
  } as unknown as RegionsService);
});

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns pinned places from private Photon and constrains search to Vietnam', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [feature] }),
    });
    global.fetch = fetchMock;

    const result = await service.search('MK building', 8);

    expect(result).toEqual([
      {
        name: 'MK Building',
        formattedAddress: '1 Lữ Gia, Hồ Chí Minh, Việt Nam',
        latitude: 10.762,
        longitude: 106.657,
      },
    ]);
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.origin).toBe('http://photon.internal:2322');
    expect(url.pathname).toBe('/api');
    expect(url.searchParams.get('bbox')).toBe('102.1,8.0,109.5,23.5');
  });

  it('returns 404 for an unresolved address and preserves reverse pin', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [feature] }),
    });
    await expect(service.resolve('unrelated address')).rejects.toMatchObject({
      status: 404,
    });
    expect(await service.reverse(10.8, 106.7)).toMatchObject({
      latitude: 10.8,
      longitude: 106.7,
    });
  });

  it('maps upstream denial to 503', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 });
    await expect(service.search('MK', 8)).rejects.toMatchObject({
      status: 503,
    });
  });

  it('returns an empty search list but 404 for missing resolution', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    });
    await expect(service.search('missing', 8)).resolves.toEqual([]);
    await expect(service.resolve('missing')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('resolves a full street address despite punctuation in Photon text', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ features: [feature] }),
      });
    await expect(
      service.resolve('1 Lữ Gia, Hồ Chí Minh'),
    ).resolves.toMatchObject({ name: 'MK Building' });
  });

  it('resolves a named venue without street when Photon identifies a POI', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            properties: {
              name: 'MK Building',
              osm_key: 'building',
              city: 'Hồ Chí Minh',
            },
            geometry: feature.geometry,
          },
        ],
      }),
    });
    await expect(service.resolve('MK Building')).resolves.toMatchObject({
      name: 'MK Building',
      formattedAddress: 'Hồ Chí Minh',
    });
  });

  it('does not return a name-only Photon record as an address', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          { properties: { name: 'MK Building' }, geometry: feature.geometry },
        ],
      }),
    });
    await expect(service.search('MK', 8)).resolves.toEqual([]);
  });

  it('rejects incomplete reverse data with 422', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          { properties: { name: 'Vietnam' }, geometry: feature.geometry },
        ],
      }),
    });
    await expect(service.reverse(10.8, 106.7)).rejects.toMatchObject({
      status: 422,
    });
  });

  it('rejects a district centroid as incomplete street data', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            properties: {
              name: 'MK Building',
              district: 'Bình Trưng',
              city: 'Hồ Chí Minh',
            },
            geometry: feature.geometry,
          },
        ],
      }),
    });
    await expect(service.resolve('MK Building')).rejects.toMatchObject({
      status: 422,
    });
  });
});
