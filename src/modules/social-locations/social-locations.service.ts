import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SocialPlace {
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
}

interface PhotonFeature {
  properties?: Record<string, unknown>;
  geometry?: { coordinates?: unknown[] };
}

@Injectable()
export class SocialLocationsService {
  private readonly logger = new Logger(SocialLocationsService.name);
  private readonly photonBaseUrl: URL;
  private static readonly vietnamBbox = '102.1,8.0,109.5,23.5';

  constructor(config: ConfigService) {
    this.photonBaseUrl = new URL(
      config.get<string>('PHOTON_BASE_URL') || 'http://localhost:2322',
    );
  }

  async search(query: string, limit = 8): Promise<SocialPlace[]> {
    const features = await this.getFeatures('/api', {
      q: query.trim(),
      limit: String(limit),
      bbox: SocialLocationsService.vietnamBbox,
      lang: 'default',
    });
    return features
      .map((feature) => this.toPlace(feature))
      .filter((place): place is SocialPlace => place !== null);
  }

  async resolve(text: string): Promise<SocialPlace> {
    const features = await this.getFeatures('/api', {
      q: text.trim(),
      limit: '8',
      bbox: SocialLocationsService.vietnamBbox,
      lang: 'default',
    });
    if (features.length === 0)
      throw new HttpException('Location not found', 404);
    const places = features
      .map((feature) => this.toPlace(feature, true))
      .filter((place): place is SocialPlace => place !== null);
    const key = this.normalize(text.split(',')[0]);
    const tokens = key.split(/\s+/).filter(Boolean);
    const match = places.find((place) =>
      tokens.every((token) =>
        this.normalize(`${place.name} ${place.formattedAddress}`)
          .split(/\s+/)
          .includes(token),
      ),
    );
    if (match) return match;
    if (places.length === 0)
      throw new HttpException('Incomplete location data', 422);
    throw new HttpException('Location not found', 404);
  }

  async reverse(lat: number, lon: number): Promise<SocialPlace> {
    const features = await this.getFeatures('/reverse', {
      lat: String(lat),
      lon: String(lon),
      limit: '1',
    });
    if (features.length === 0)
      throw new HttpException('Location not found', 404);
    const place = features
      .map((feature) => this.toPlace(feature, true))
      .find((candidate) => candidate !== null);
    if (!place) throw new HttpException('Incomplete location data', 422);
    return { ...place, latitude: lat, longitude: lon };
  }

  private async getFeatures(
    path: string,
    params: Record<string, string>,
  ): Promise<PhotonFeature[]> {
    const url = new URL(path, this.photonBaseUrl);
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, value);
    try {
      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        this.logger.warn(`Photon ${path} returned HTTP ${response.status}`);
        throw new HttpException('Location provider unavailable', 503);
      }
      const body: unknown = await response.json();
      if (
        !body ||
        typeof body !== 'object' ||
        !Array.isArray((body as { features?: unknown }).features)
      ) {
        throw new HttpException('Location provider unavailable', 503);
      }
      return (body as { features: PhotonFeature[] }).features;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.warn(`Photon ${path} request failed: ${String(error)}`);
      throw new HttpException('Location provider unavailable', 503);
    }
  }

  private toPlace(
    feature: PhotonFeature,
    requireStreet = false,
  ): SocialPlace | null {
    const p = feature?.properties;
    const coordinates = feature?.geometry?.coordinates;
    if (!p || !Array.isArray(coordinates) || coordinates.length < 2)
      return null;
    const longitude = Number(coordinates[0]);
    const latitude = Number(coordinates[1]);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    )
      return null;
    const value = (key: string) =>
      typeof p[key] === 'string' ? (p[key] as string).trim() : '';
    const name = value('name');
    const street =
      value('street') || (value('osm_key') === 'highway' ? name : '');
    const streetLine = [value('housenumber'), street].filter(Boolean).join(' ');
    const locality = [value('district'), value('city'), value('state')].some(
      Boolean,
    );
    const namedPoi =
      name !== '' &&
      locality &&
      [
        'amenity',
        'building',
        'leisure',
        'shop',
        'tourism',
        'sport',
        'office',
        'historic',
        'craft',
        'club',
        'man_made',
        'healthcare',
      ].includes(value('osm_key'));
    if (requireStreet && !streetLine && !namedPoi) return null;
    const formattedAddress = [
      streetLine,
      value('district'),
      value('city'),
      value('state'),
      value('country'),
    ]
      .filter(Boolean)
      .filter((part, index, all) => all.indexOf(part) === index)
      .join(', ');
    if (!formattedAddress) return null;
    if (formattedAddress === value('country')) return null;
    return {
      name: name || formattedAddress,
      formattedAddress: formattedAddress || name,
      latitude,
      longitude,
    };
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }
}
