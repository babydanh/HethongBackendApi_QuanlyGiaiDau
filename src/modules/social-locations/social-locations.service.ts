import { HttpException, Inject, Injectable } from '@nestjs/common';
import { PLACE_PROVIDER } from './photon.provider';
import type { PlaceProvider, PlaceResult } from './photon.provider';
import { RegionsService } from '../regions/regions.service';

export type SocialPlace = Pick<PlaceResult, 'name' | 'formattedAddress' | 'latitude' | 'longitude'>;

@Injectable()
export class SocialLocationsService {
  private readonly searchCache = new Map<string, { until: number; value: PlaceResult[] }>();
  private readonly detailCache = new Map<string, { until: number; value: PlaceResult }>();

  constructor(
    @Inject(PLACE_PROVIDER) private readonly provider: PlaceProvider,
    private readonly regions: RegionsService,
  ) {}

  async autocomplete(query: string, limit = 8, bias?: { lat: number; lng: number }): Promise<PlaceResult[]> {
    const key = `${query.trim().normalize('NFC').toLowerCase()}|${limit}|${bias ? `${bias.lat.toFixed(3)},${bias.lng.toFixed(3)}` : ''}`;
    const hit = this.searchCache.get(key);
    if (hit && hit.until > Date.now()) return hit.value;
    const places = await this.provider.autocomplete(query, limit, bias);
    const value = await Promise.all(places.map((place) => this.withRegion(place)));
    this.searchCache.set(key, { until: Date.now() + 60 * 60 * 1000, value });
    if (this.searchCache.size > 1000) this.searchCache.delete(this.searchCache.keys().next().value!);
    return value;
  }

  async detail(placeId: string): Promise<PlaceResult> {
    const hit = this.detailCache.get(placeId);
    if (hit && hit.until > Date.now()) return hit.value;
    const mapped = await this.withRegion(await this.provider.detail(placeId));
    this.detailCache.set(placeId, { until: Date.now() + 24 * 60 * 60 * 1000, value: mapped });
    if (this.detailCache.size > 1000) this.detailCache.delete(this.detailCache.keys().next().value!);
    return mapped;
  }

  async reversePlace(lat: number, lng: number): Promise<PlaceResult> {
    return this.withRegion(await this.provider.reverse(lat, lng));
  }

  // Legacy response shape remains unchanged for deployed clients.
  async search(query: string, limit = 8): Promise<SocialPlace[]> {
    return (await this.provider.autocomplete(query, limit)).map(this.legacyPlace);
  }

  async resolve(text: string): Promise<SocialPlace> {
    // Legacy text resolution is only available on the transitional Photon adapter.
    const places = await this.provider.resolveLegacy(text);
    if (places.length === 0) throw new HttpException('Incomplete location data', 422);
    const key = this.normalize(text.split(',')[0]);
    const tokens = key.split(/\s+/).filter(Boolean);
    const match = places.find((place) => tokens.every((token) =>
      this.normalize(`${place.name} ${place.formattedAddress}`).split(/\s+/).includes(token)));
    if (!match) throw new HttpException('Location not found', 404);
    return this.legacyPlace(match);
  }

  async reverse(lat: number, lon: number): Promise<SocialPlace> {
    return this.legacyPlace(await this.provider.reverse(lat, lon));
  }

  private legacyPlace(place: PlaceResult): SocialPlace {
    return {
      name: place.name, formattedAddress: place.formattedAddress,
      latitude: place.latitude, longitude: place.longitude,
    };
  }

  private async withRegion(place: PlaceResult): Promise<PlaceResult> {
    const region = await this.regions.resolveByPoint({ lat: place.latitude, lng: place.longitude });
    const names = region && !region.isEstimated
      ? { provinceCode: null, wardCode: null }
      : await this.regions.matchProviderNames(place.sourceProvince, place.sourceWard);
    // Nearest-centroid results are estimates and must not become persisted codes.
    return {
      ...place,
      provinceCode: region && !region.isEstimated ? region.provinceCode : names.provinceCode,
      wardCode: region && !region.isEstimated ? region.wardCode : names.wardCode,
      regionEstimated: region?.isEstimated ?? false,
    };
  }

  private normalize(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }
}
