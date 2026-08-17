import { RegionsRepository } from './regions.repository';
import { QueryRegionDto, QueryWardDto } from './dto/query-region.dto';
export declare class RegionsService {
    private readonly regionsRepository;
    constructor(regionsRepository: RegionsRepository);
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
