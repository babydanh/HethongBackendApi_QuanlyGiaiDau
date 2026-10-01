import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PlaceResult {
  placeId: string | null;
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  sourceProvince: string | null;
  sourceWard: string | null;
  provinceCode: string | null;
  wardCode: string | null;
  regionEstimated: boolean;
}

export interface PlaceProvider {
  autocomplete(query: string, limit: number, bias?: { lat: number; lng: number }): Promise<PlaceResult[]>;
  detail(placeId: string): Promise<PlaceResult>;
  reverse(lat: number, lng: number): Promise<PlaceResult>;
  resolveLegacy(text: string): Promise<PlaceResult[]>;
}

export const PLACE_PROVIDER = Symbol('PLACE_PROVIDER');

interface PhotonFeature {
  properties?: Record<string, unknown>;
  geometry?: { coordinates?: unknown[] };
}

@Injectable()
export class PhotonProvider implements PlaceProvider {
  private readonly logger = new Logger(PhotonProvider.name);
  private readonly baseUrl: URL;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.baseUrl = new URL(config.get<string>('PHOTON_BASE_URL') || 'http://localhost:2322');
    this.timeoutMs = Number(config.get<string>('PHOTON_TIMEOUT_MS') || 5000);
  }

  async autocomplete(query: string, limit: number, bias?: { lat: number; lng: number }) {
    const params: Record<string, string> = {
      q: query.trim(), limit: String(limit), bbox: '102.1,8.0,109.5,23.5', lang: 'default',
    };
    if (bias) {
      params.lat = String(bias.lat);
      params.lon = String(bias.lng);
    }
    return (await this.getFeatures('/api', params)).map((item) => this.toPlace(item)).filter((item): item is PlaceResult => item !== null);
  }

  // Photon has no lookup-by-OSM-ID endpoint. Search candidates, then match the
  // namespaced OSM ID exactly; never return a different search hit as detail.
  async detail(placeId: string): Promise<PlaceResult> {
    if (placeId.length > 400) throw new HttpException({ code: 'INVALID_PLACE_ID' }, 400);
    const match = /^photon:(node|way|relation):([0-9]+):(.+)$/.exec(placeId);
    if (!match) throw new HttpException({ code: 'INVALID_PLACE_ID' }, 400);
    let name: string;
    try { name = decodeURIComponent(match[3]); }
    catch { throw new HttpException({ code: 'INVALID_PLACE_ID' }, 400); }
    if (!name.trim() || name.length > 200) throw new HttpException({ code: 'INVALID_PLACE_ID' }, 400);
    const candidates = await this.autocomplete(name, 8);
    const found = candidates.find((item) => item.placeId === placeId);
    if (!found) throw new HttpException({ code: 'PLACE_NOT_FOUND' }, 404);
    return found;
  }

  async resolveLegacy(text: string): Promise<PlaceResult[]> {
    const features = await this.getFeatures('/api', {
      q: text.trim(), limit: '8', bbox: '102.1,8.0,109.5,23.5', lang: 'default',
    });
    if (features.length === 0) throw new HttpException('Location not found', 404);
    const places = features.map((feature) => this.toPlace(feature, true))
      .filter((item): item is PlaceResult => item !== null);
    if (places.length === 0) throw new HttpException('Incomplete location data', 422);
    return places;
  }

  async reverse(lat: number, lng: number): Promise<PlaceResult> {
    const features = await this.getFeatures('/reverse', { lat: String(lat), lon: String(lng), limit: '1' });
    if (features.length === 0) throw new HttpException({ code: 'PLACE_NOT_FOUND' }, 404);
    const place = features.map((feature) => this.toPlace(feature, true)).find((candidate) => candidate !== null);
    if (!place) throw new HttpException({ code: 'INCOMPLETE_PLACE' }, 422);
    return { ...place, latitude: lat, longitude: lng };
  }

  private async getFeatures(path: string, params: Record<string, string>): Promise<PhotonFeature[]> {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const started = Date.now();
    try {
      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        this.logger.warn(`Photon ${path} status=${response.status} duration_ms=${Date.now() - started}`);
        throw new HttpException({ code: response.status === 429 ? 'PLACE_QUOTA_EXCEEDED' : 'PLACE_PROVIDER_UNAVAILABLE' }, 503);
      }
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || !Array.isArray((body as { features?: unknown }).features)) {
        throw new HttpException({ code: 'PLACE_PROVIDER_UNAVAILABLE' }, 503);
      }
      this.logger.log(`Photon ${path} status=200 duration_ms=${Date.now() - started}`);
      return (body as { features: PhotonFeature[] }).features;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.warn(`Photon ${path} failed duration_ms=${Date.now() - started}`);
      throw new HttpException({ code: 'PLACE_PROVIDER_UNAVAILABLE' }, 503);
    }
  }

  private toPlace(feature: PhotonFeature, requireStreet = false): PlaceResult | null {
    const p = feature?.properties;
    const coordinates = feature?.geometry?.coordinates;
    if (!p || !Array.isArray(coordinates) || coordinates.length < 2) return null;
    const longitude = Number(coordinates[0]);
    const latitude = Number(coordinates[1]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    const value = (key: string) => typeof p[key] === 'string' ? (p[key] as string).trim() : '';
    const name = value('name');
    const street = value('street') || (value('osm_key') === 'highway' ? name : '');
    const streetLine = [value('housenumber'), street].filter(Boolean).join(' ');
    const locality = [value('district'), value('city'), value('state')].some(Boolean);
    const namedPoi = name !== '' && locality && [
      'amenity', 'building', 'leisure', 'shop', 'tourism', 'sport', 'office',
      'historic', 'craft', 'club', 'man_made', 'healthcare',
    ].includes(value('osm_key'));
    if (requireStreet && !streetLine && !namedPoi) return null;
    const formattedAddress = [streetLine, value('district'), value('city'), value('state'), value('country')]
      .filter(Boolean).filter((part, index, all) => all.indexOf(part) === index).join(', ');
    if (!formattedAddress || formattedAddress === value('country')) return null;
    const osmType = ({ n: 'node', w: 'way', r: 'relation' } as Record<string, string>)[value('osm_type').toLowerCase()] ?? value('osm_type').toLowerCase();
    const osmId = String(p.osm_id ?? '');
    const placeId = ['node', 'way', 'relation'].includes(osmType) && /^[0-9]+$/.test(osmId)
      ? `photon:${osmType}:${osmId}:${encodeURIComponent(name || formattedAddress)}` : null;
    return {
      placeId, name: name || formattedAddress, formattedAddress, latitude, longitude,
      sourceProvince: value('state') || value('city') || null,
      sourceWard: value('locality') || null,
      provinceCode: null, wardCode: null, regionEstimated: false,
    };
  }
}
