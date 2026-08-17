export declare enum UserRole {
    PLAYER = "PLAYER",
    REFEREE = "REFEREE",
    ORGANIZER = "ORGANIZER",
    MODERATOR = "MODERATOR",
    ADMIN = "ADMIN"
}
export declare enum UserStatus {
    ACTIVE = "ACTIVE",
    BANNED = "BANNED",
    PENDING_VERIFICATION = "PENDING_VERIFICATION"
}
export declare enum TournamentStatus {
    UPCOMING = "UPCOMING",
    ONGOING = "ONGOING",
    COMPLETED = "COMPLETED",
    CANCELLED = "CANCELLED"
}
export declare enum MatchStatus {
    SCHEDULED = "SCHEDULED",
    ONGOING = "ONGOING",
    COMPLETED = "COMPLETED",
    DISPUTED = "DISPUTED"
}
export declare enum PaymentStatus {
    PENDING = "PENDING",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED",
    REFUNDED = "REFUNDED"
}
export declare enum TeamStatus {
    PENDING = "PENDING",
    COMPLETE = "COMPLETE",
    WITHDRAWN = "WITHDRAWN",
    KICKED = "KICKED"
}
export declare enum RefundStatus {
    PENDING_REFUND = "PENDING_REFUND",
    REFUNDED = "REFUNDED",
    FAILED = "FAILED"
}
export declare enum PaymentGateway {
    VNPAY = "VNPAY",
    MOMO = "MOMO",
    BANK_TRANSFER = "BANK_TRANSFER"
}
export declare enum MatchType {
    SINGLES = "SINGLES",
    DOUBLES = "DOUBLES"
}
export declare enum GenderRestriction {
    ANY = "ANY",
    MALE = "MALE",
    FEMALE = "FEMALE",
    MIXED = "MIXED"
}
