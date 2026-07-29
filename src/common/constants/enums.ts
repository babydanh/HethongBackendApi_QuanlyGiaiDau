export enum UserRole {
  PLAYER = 'PLAYER',
  REFEREE = 'REFEREE',
  ORGANIZER = 'ORGANIZER',
  MODERATOR = 'MODERATOR',
  ADMIN = 'ADMIN',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  BANNED = 'BANNED',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
}

export enum TournamentStatus {
  UPCOMING = 'UPCOMING',
  ONGOING = 'ONGOING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum MatchStatus {
  SCHEDULED = 'SCHEDULED',
  ONGOING = 'ONGOING',
  COMPLETED = 'COMPLETED',
  DISPUTED = 'DISPUTED',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export enum TeamStatus {
  PENDING = 'PENDING',
  COMPLETE = 'COMPLETE',
  WITHDRAWN = 'WITHDRAWN',
  KICKED = 'KICKED',
}

export enum RefundStatus {
  PENDING_REFUND = 'PENDING_REFUND',
  REFUNDED = 'REFUNDED',
  FAILED = 'FAILED',
}

export enum PaymentGateway {
  VNPAY = 'VNPAY',
  MOMO = 'MOMO',
  BANK_TRANSFER = 'BANK_TRANSFER',
}

export enum MatchType {
  SINGLES = 'SINGLES',
  DOUBLES = 'DOUBLES',
}

export enum GenderRestriction {
  ANY = 'ANY',
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  MIXED = 'MIXED',
}
