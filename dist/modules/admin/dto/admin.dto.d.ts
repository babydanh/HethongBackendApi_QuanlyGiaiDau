import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { type ReportCategory, type ReportTargetType } from '../../users/dto/create-report.dto';
import { type ReportStatus } from '../../users/dto/query-my-reports.dto';
export declare class SubmitTicketDto {
    evidenceUrls: string[];
    contactPhone: string;
}
export declare class RejectTicketDto {
    rejectReason: string;
}
export declare class BanUserDto {
    reason: string;
    banType: 'WARN' | 'SOFT_BAN' | 'HARD_BAN';
    expiresAt?: string;
}
export declare class UpdateConfigDto {
    value: string;
    description?: string;
}
export declare class ResolveReportDto {
    status: 'RESOLVED' | 'REJECTED';
    resolutionNote: string;
    category?: ReportCategory;
}
export declare class ReportWorkflowNoteDto {
    note: string;
    category?: ReportCategory;
}
export declare class QueryReportsDto extends CursorPaginationDto {
    page: number;
    limit: number;
    status?: ReportStatus;
    targetType?: ReportTargetType;
    category?: ReportCategory;
    from?: string;
    to?: string;
    search?: string;
}
export declare class TournamentAdminActionDto {
    note?: string;
}
