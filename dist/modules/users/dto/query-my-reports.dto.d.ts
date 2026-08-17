import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { type ReportCategory, type ReportTargetType } from './create-report.dto';
export declare const REPORT_STATUSES: readonly ["SUBMITTED", "TRIAGED", "UNDER_REVIEW", "ESCALATED", "RESOLVED", "REJECTED"];
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export declare class QueryMyReportsDto extends CursorPaginationDto {
    page: number;
    limit: number;
    status?: ReportStatus;
    targetType?: ReportTargetType;
    category?: ReportCategory;
}
