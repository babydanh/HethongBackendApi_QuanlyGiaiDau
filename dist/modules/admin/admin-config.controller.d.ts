import { AdminService } from './admin.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UpdateConfigDto } from './dto/admin.dto';
export declare class AdminConfigController {
    private readonly adminService;
    constructor(adminService: AdminService);
    getConfigs(): Promise<{
        key: string;
        value: string;
        description: string | null;
        updatedBy: string;
        updatedAt: Date;
    }[]>;
    updateConfig(admin: JwtPayload, key: string, dto: UpdateConfigDto): Promise<any>;
}
