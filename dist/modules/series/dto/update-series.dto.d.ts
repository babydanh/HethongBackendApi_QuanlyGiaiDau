import { CreateSeriesDto } from './create-series.dto';
declare const UpdateSeriesDto_base: import("@nestjs/common").Type<Partial<CreateSeriesDto>>;
export declare class UpdateSeriesDto extends UpdateSeriesDto_base {
    status?: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
}
export {};
