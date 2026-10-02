import { PartialType } from '@nestjs/swagger';
import { Validate, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';
import { CreateVenueDto } from './create-venue.dto';

@ValidatorConstraint({ name: 'venueCoordinatePair', async: false })
class VenueCoordinatePairConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: { object: UpdateVenueDto }) {
    const { latitude, longitude } = args.object;
    const hasLat = latitude !== undefined;
    const hasLng = longitude !== undefined;
    if (!hasLat && !hasLng) return true;
    if (latitude === null && longitude === null) return true;
    return hasLat && hasLng && typeof latitude === 'number' && Number.isFinite(latitude)
      && latitude >= -90 && latitude <= 90 && typeof longitude === 'number'
      && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
  }
  defaultMessage() { return 'latitude and longitude must be supplied as a valid pair'; }
}

export class UpdateVenueDto extends PartialType(CreateVenueDto) {
  @Validate(VenueCoordinatePairConstraint)
  private readonly _coordinatePair?: never;
}
