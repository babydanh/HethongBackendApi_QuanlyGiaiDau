import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';

export const LOCATION_REGIONS = ['VIETNAM', 'FOREIGN', 'OTHER'] as const;
export type LocationRegion = (typeof LOCATION_REGIONS)[number];

// This classifier intentionally only marks a location as FOREIGN when the
// stored address explicitly names a country. An unknown address is OTHER,
// never FOREIGN by assumption.
const VIETNAM_LOCATION_PATTERN =
  '(việt[[:space:]]*nam|vietnam|hồ[[:space:]]*chí[[:space:]]*minh|ho[[:space:]]*chi[[:space:]]*minh|hcmc?|hà[[:space:]]*nội|ha[[:space:]]*noi|đà[[:space:]]*nẵng|da[[:space:]]*nang|cần[[:space:]]*thơ|can[[:space:]]*tho|hải[[:space:]]*phòng|hai[[:space:]]*phong|quận|quan|huyện|huyen|phường|phuong|xã|xa|tỉnh|tinh|(^|[^a-z])q[[:digit:]]+([^a-z]|$))';

const FOREIGN_LOCATION_PATTERN =
  '(singapore|thailand|japan|korea|south[[:space:]]*korea|malaysia|indonesia|philippines|china|taiwan|hong[[:space:]]*kong|united[[:space:]]*states|usa|australia|united[[:space:]]*kingdom|uk|france|germany|canada|new[[:space:]]*zealand|italy|spain|netherlands|india|cambodia|laos|myanmar|russia|brazil)';

const vietnamLocationRegex = new RegExp(VIETNAM_LOCATION_PATTERN, 'i');
const foreignLocationRegex = new RegExp(FOREIGN_LOCATION_PATTERN, 'i');
const vietnamProvinceCodeRegex = /^\d{1,6}$/;

export function classifyLocationRegion(input: {
  provinceCode?: string | null;
  locationText?: string | null;
}): LocationRegion {
  const provinceCode = input.provinceCode?.trim() ?? '';
  const locationText = input.locationText?.trim() ?? '';
  if (vietnamProvinceCodeRegex.test(provinceCode) || vietnamLocationRegex.test(locationText)) {
    return 'VIETNAM';
  }
  if (foreignLocationRegex.test(locationText)) return 'FOREIGN';
  return 'OTHER';
}

export function locationRegionCondition(
  region: LocationRegion,
  options: {
    provinceCode?: SQLWrapper;
    locationText: SQL;
  },
) {
  const isVietnam = sql`(
    ${options.provinceCode ? sql`NULLIF(BTRIM(${options.provinceCode}), '') ~ '^[0-9]{1,6}$' OR ` : sql``}
    COALESCE(${options.locationText}, '') ~* ${VIETNAM_LOCATION_PATTERN}
  )`;
  const isForeign = sql`COALESCE(${options.locationText}, '') ~* ${FOREIGN_LOCATION_PATTERN}`;

  if (region === 'VIETNAM') return isVietnam;
  if (region === 'FOREIGN') return sql`(${isForeign} AND NOT ${isVietnam})`;
  return sql`(NOT ${isVietnam} AND NOT ${isForeign})`;
}
