import { PartialType } from '@nestjs/swagger';
import { CreateAdvertisementDto } from './create-advertisement.dto';

export class UpdateAdvertisementDto extends PartialType(CreateAdvertisementDto) {}
