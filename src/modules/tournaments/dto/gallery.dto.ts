import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class UploadGalleryDto {
  @ApiProperty({
    example: 'https://storage.example.com/image/upload/sample.jpg',
    description: 'Public URL of the gallery image returned by the storage provider',
  })
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  url: string;
}
