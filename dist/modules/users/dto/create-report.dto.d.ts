export declare const REPORT_TARGET_TYPES: readonly ["USER", "TOURNAMENT", "MATCH", "COMMUNITY"];
export declare const REPORT_CATEGORIES: readonly ["CHEATING", "RULE_VIOLATION", "ABUSIVE_BEHAVIOR", "FAKE_INFORMATION", "PAYMENT_FRAUD", "UNSAFE_ORGANIZATION", "OTHER"];
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];
export declare class CreateReportDto {
    targetType: ReportTargetType;
    targetId: string;
    category: ReportCategory;
    reason: string;
    evidenceUrls?: string[];
}
