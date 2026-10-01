import { ConfigService } from '@nestjs/config';
import { RegionsService } from '../regions/regions.service';
import { PhotonProvider } from './photon.provider';
import { SocialLocationsService } from './social-locations.service';

const feature = {
  properties: {
    osm_type: 'N', osm_id: 12345, name: 'Sân Thảo Điền',
    street: 'Thảo Điền', city: 'Hồ Chí Minh', country: 'Việt Nam',
  },
  geometry: { coordinates: [106.72, 10.81] },
};

describe('places search/detail/reverse', () => {
  const originalFetch = global.fetch;
  let provider: PhotonProvider;
  let service: SocialLocationsService;

  beforeEach(() => {
    provider = new PhotonProvider({ get: (key: string) => key === 'PHOTON_BASE_URL' ? 'http://photon.internal:2322' : undefined } as unknown as ConfigService);
    service = new SocialLocationsService(provider, {
      resolveByPoint: jest.fn().mockResolvedValue(null),
      matchProviderNames: jest.fn().mockResolvedValue({ provinceCode: '79', wardCode: null }),
    } as unknown as RegionsService);
  });

  afterEach(() => { global.fetch = originalFetch; });

  it('uses namespaced OSM identity, validates detail identity, and caches by query', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [feature] }) });
    global.fetch = fetchMock;
    const results = await service.autocomplete('Sân Thảo Điền');
    expect(results[0].placeId).toContain('photon:node:12345:');
    expect(results[0].provinceCode).toBe('79');
    expect(results[0].wardCode).toBeNull();
    await service.autocomplete('Sân Thảo Điền');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const detail = await service.detail(results[0].placeId!);
    expect(detail.provinceCode).toBe('79');
    expect(detail.wardCode).toBeNull();
    await service.detail(results[0].placeId!);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(service.detail('photon:node:99999:Other')).rejects.toMatchObject({ status: 404 });
  });

  it('preserves the pin and never turns a malformed result into a place', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [feature] }) });
    expect(await service.reversePlace(10.8, 106.7)).toMatchObject({ latitude: 10.8, longitude: 106.7 });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [{ ...feature, geometry: { coordinates: [999, 999] } }] }) });
    await expect(service.reversePlace(10.8, 106.7)).rejects.toMatchObject({ status: 422 });
  });
});
