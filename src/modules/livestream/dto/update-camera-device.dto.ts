import { PartialType } from '@nestjs/swagger';
import { CreateCameraDeviceDto } from './create-camera-device.dto';

export class UpdateCameraDeviceDto extends PartialType(CreateCameraDeviceDto) {}
