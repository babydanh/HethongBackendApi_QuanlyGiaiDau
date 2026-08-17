export declare const payoutReviewStatuses: readonly ["UNDER_REVIEW", "APPROVED", "PROCESSING", "PAID", "REJECTED"];
export type PayoutReviewStatus = (typeof payoutReviewStatuses)[number];
export declare class ReviewPayoutDto {
    status: PayoutReviewStatus;
    transactionProofUrl?: string;
    note?: string;
}
