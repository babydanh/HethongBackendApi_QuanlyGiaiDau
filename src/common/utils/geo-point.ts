import { BadRequestException } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';

export interface GeoSnapshot {
  latitude: number;
  longitude: number;
  venueGeolocation: SQL;
}

export function validateCoordinatePair(
  latitude: unknown,
  longitude: unknown,
  options: { required?: boolean } = {},
): { latitude: number; longitude: number } | null {
  const hasLat = latitude !== undefined && latitude !== null;
  const hasLng = longitude !== undefined && longitude !== null;
  if (!hasLat && !hasLng && !options.required) return null;
  if (!hasLat || !hasLng || typeof latitude !== 'number' || typeof longitude !== 'number'
    || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new BadRequestException({ code: 'INVALID_COORDINATES' });
  }
  return { latitude, longitude };
}

/** Builds a WGS84 geography point. Argument order follows PostGIS: longitude, latitude. */
export function geoPoint(longitude: number, latitude: number): SQL {
  validateCoordinatePair(latitude, longitude, { required: true });
  return sql`ST_SetSRID(ST_MakePoint(${longitude}::float8, ${latitude}::float8), 4326)::geography`;
}

export function geoSnapshot(latitude: number, longitude: number): GeoSnapshot {
  const pair = validateCoordinatePair(latitude, longitude, { required: true })!;
  return { ...pair, venueGeolocation: geoPoint(pair.longitude, pair.latitude) };
}
