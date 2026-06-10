import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class UploadGalleryDto {
  @ApiProperty({
    example: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    description: 'Cloudinary URL of the gallery image',
  })
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  url: string;
}
