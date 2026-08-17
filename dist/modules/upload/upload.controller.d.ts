import { StorageService } from '../../providers/storage/storage.service';
export declare class UploadController {
    private readonly storageService;
    constructor(storageService: StorageService);
    uploadImage(file: Express.Multer.File): Promise<{
        url: any;
        publicId: any;
    }>;
}
