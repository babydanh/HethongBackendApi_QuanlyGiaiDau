import type { AppDb } from '../../database/db.types';
import { QueryRegionDto, QueryWardDto } from './dto/query-region.dto';
export declare class RegionsRepository {
    private readonly db;
    constructor(db: AppDb);
    findProvinces(query: QueryRegionDto): Promise<{
        id: string;
        code: string;
        name: string;
        nameEn: string | null;
        fullName: string | null;
        fullNameEn: string | null;
        codeName: string | null;
        createdAt: Date;
    }[]>;
    findWards(query: QueryWardDto): Promise<{
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
