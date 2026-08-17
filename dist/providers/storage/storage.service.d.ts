import { ConfigService } from '@nestjs/config';
import { UploadApiErrorResponse, UploadApiResponse } from 'cloudinary';
export declare class StorageService {
    private configService;
    private readonly logger;
    constructor(configService: ConfigService);
    uploadFile(file: Express.Multer.File, folder?: string): Promise<UploadApiResponse | UploadApiErrorResponse>;
    deleteFile(publicId: string): Promise<unknown>;
}
