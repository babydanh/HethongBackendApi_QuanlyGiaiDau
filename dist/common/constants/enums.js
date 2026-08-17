"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenderRestriction = exports.MatchType = exports.PaymentGateway = exports.RefundStatus = exports.TeamStatus = exports.PaymentStatus = exports.MatchStatus = exports.TournamentStatus = exports.UserStatus = exports.UserRole = void 0;
var UserRole;
(function (UserRole) {
    UserRole["PLAYER"] = "PLAYER";
    UserRole["REFEREE"] = "REFEREE";
    UserRole["ORGANIZER"] = "ORGANIZER";
    UserRole["MODERATOR"] = "MODERATOR";
    UserRole["ADMIN"] = "ADMIN";
})(UserRole || (exports.UserRole = UserRole = {}));
var UserStatus;
(function (UserStatus) {
    UserStatus["ACTIVE"] = "ACTIVE";
    UserStatus["BANNED"] = "BANNED";
    UserStatus["PENDING_VERIFICATION"] = "PENDING_VERIFICATION";
})(UserStatus || (exports.UserStatus = UserStatus = {}));
var TournamentStatus;
(function (TournamentStatus) {
    TournamentStatus["UPCOMING"] = "UPCOMING";
    TournamentStatus["ONGOING"] = "ONGOING";
    TournamentStatus["COMPLETED"] = "COMPLETED";
    TournamentStatus["CANCELLED"] = "CANCELLED";
})(TournamentStatus || (exports.TournamentStatus = TournamentStatus = {}));
var MatchStatus;
(function (MatchStatus) {
    MatchStatus["SCHEDULED"] = "SCHEDULED";
    MatchStatus["ONGOING"] = "ONGOING";
    MatchStatus["COMPLETED"] = "COMPLETED";
    MatchStatus["DISPUTED"] = "DISPUTED";
})(MatchStatus || (exports.MatchStatus = MatchStatus = {}));
var PaymentStatus;
(function (PaymentStatus) {
    PaymentStatus["PENDING"] = "PENDING";
    PaymentStatus["COMPLETED"] = "COMPLETED";
    PaymentStatus["FAILED"] = "FAILED";
    PaymentStatus["REFUNDED"] = "REFUNDED";
})(PaymentStatus || (exports.PaymentStatus = PaymentStatus = {}));
var TeamStatus;
(function (TeamStatus) {
    TeamStatus["PENDING"] = "PENDING";
    TeamStatus["COMPLETE"] = "COMPLETE";
    TeamStatus["WITHDRAWN"] = "WITHDRAWN";
    TeamStatus["KICKED"] = "KICKED";
})(TeamStatus || (exports.TeamStatus = TeamStatus = {}));
var RefundStatus;
(function (RefundStatus) {
    RefundStatus["PENDING_REFUND"] = "PENDING_REFUND";
    RefundStatus["REFUNDED"] = "REFUNDED";
    RefundStatus["FAILED"] = "FAILED";
})(RefundStatus || (exports.RefundStatus = RefundStatus = {}));
var PaymentGateway;
(function (PaymentGateway) {
    PaymentGateway["VNPAY"] = "VNPAY";
    PaymentGateway["MOMO"] = "MOMO";
    PaymentGateway["BANK_TRANSFER"] = "BANK_TRANSFER";
})(PaymentGateway || (exports.PaymentGateway = PaymentGateway = {}));
var MatchType;
(function (MatchType) {
    MatchType["SINGLES"] = "SINGLES";
    MatchType["DOUBLES"] = "DOUBLES";
})(MatchType || (exports.MatchType = MatchType = {}));
var GenderRestriction;
(function (GenderRestriction) {
    GenderRestriction["ANY"] = "ANY";
    GenderRestriction["MALE"] = "MALE";
    GenderRestriction["FEMALE"] = "FEMALE";
    GenderRestriction["MIXED"] = "MIXED";
})(GenderRestriction || (exports.GenderRestriction = GenderRestriction = {}));
//# sourceMappingURL=enums.js.map