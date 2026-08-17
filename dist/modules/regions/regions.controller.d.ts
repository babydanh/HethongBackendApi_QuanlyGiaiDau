import { RegionsService } from './regions.service';
import { QueryRegionDto, QueryWardDto } from './dto/query-region.dto';
export declare class RegionsController {
    private readonly regionsService;
    constructor(regionsService: RegionsService);
    getProvinces(query: QueryRegionDto): Promise<{
        id: string;
        code: string;
        name: string;
        nameEn: string | null;
        fullName: string | null;
        fullNameEn: string | null;
        codeName: string | null;
        createdAt: Date;
    }[]>;
    getWards(query: QueryWardDto): Promise<{
        id: string;
        code: string;
        name: string;
        nameEn: string | null;
        fullName: string | null;
        fullNameEn: string | null;
        codeName: string | null;
        provinceCode: string;
        createdAt: Date;
    }[]>;
}
