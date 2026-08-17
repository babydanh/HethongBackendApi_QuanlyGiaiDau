"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOURNAMENT_CLEANUP_GRACE_DAYS = void 0;
exports.evaluateTournamentCleanup = evaluateTournamentCleanup;
exports.isProtectedRegistrationStatus = isProtectedRegistrationStatus;
exports.TOURNAMENT_CLEANUP_GRACE_DAYS = 7;
const CLEANUP_ELIGIBLE_STATUSES = new Set([
    'REGISTRATION_CLOSED',
    'REGISTRATION_OPEN',
    'UPCOMING',
]);
const CLEANUP_PROTECTED_REGISTRATION_STATUSES = new Set([
    'PENDING',
    'PENDING_APPROVAL',
    'PENDING_PARTNER',
    'COMPLETE',
    'APPROVED',
    'WAITLISTED',
]);
function evaluateTournamentCleanup(snapshot, now) {
    if (!CLEANUP_ELIGIBLE_STATUSES.has(snapshot.status ?? '')) {
        return { eligible: false, reason: 'STATUS_NOT_ELIGIBLE' };
    }
    if (!snapshot.registrationEndDate) {
        return { eligible: false, reason: 'REGISTRATION_END_DATE_MISSING' };
    }
    const registrationStartDate = snapshot.registrationStartDate
        ? new Date(snapshot.registrationStartDate)
        : null;
    if (!registrationStartDate || Number.isNaN(registrationStartDate.getTime())) {
        return { eligible: false, reason: 'REGISTRATION_START_DATE_INVALID' };
    }
    const registrationEndDate = new Date(snapshot.registrationEndDate);
    if (Number.isNaN(registrationEndDate.getTime())) {
        return { eligible: false, reason: 'REGISTRATION_END_DATE_INVALID' };
    }
    if (registrationStartDate >= registrationEndDate) {
        return { eligible: false, reason: 'REGISTRATION_WINDOW_INVALID' };
    }
    if (registrationStartDate > now) {
        return { eligible: false, reason: 'REGISTRATION_NOT_STARTED' };
    }
    if (registrationEndDate > now) {
        return { eligible: false, reason: 'REGISTRATION_NOT_EXPIRED' };
    }
    const startDate = snapshot.startDate ? new Date(snapshot.startDate) : null;
    if (!startDate || Number.isNaN(startDate.getTime())) {
        return { eligible: false, reason: 'START_DATE_INVALID' };
    }
    if (startDate > now) {
        return { eligible: false, reason: 'TOURNAMENT_NOT_STARTED' };
    }
    const activeRegistrationCount = snapshot.activeRegistrationCount;
    const protectedPaymentCount = snapshot.protectedPaymentCount;
    const protectedMatchCount = snapshot.protectedMatchCount;
    if (!Number.isFinite(activeRegistrationCount) ||
        !Number.isFinite(protectedPaymentCount) ||
        !Number.isFinite(protectedMatchCount) ||
        typeof snapshot.hasBracketData !== 'boolean' ||
        activeRegistrationCount === null ||
        protectedPaymentCount === null ||
        protectedMatchCount === null ||
        activeRegistrationCount === undefined ||
        protectedPaymentCount === undefined ||
        protectedMatchCount === undefined ||
        activeRegistrationCount < 0 ||
        protectedPaymentCount < 0 ||
        protectedMatchCount < 0) {
        return { eligible: false, reason: 'DEPENDENCY_DATA_INVALID' };
    }
    const gracePeriodEndsAt = new Date(registrationEndDate);
    gracePeriodEndsAt.setUTCDate(gracePeriodEndsAt.getUTCDate() + exports.TOURNAMENT_CLEANUP_GRACE_DAYS);
    if (gracePeriodEndsAt > now) {
        return { eligible: false, reason: 'GRACE_PERIOD_NOT_ELAPSED' };
    }
    if (activeRegistrationCount > 0) {
        return { eligible: false, reason: 'ACTIVE_REGISTRATION' };
    }
    if (protectedPaymentCount > 0) {
        return { eligible: false, reason: 'PROTECTED_PAYMENT' };
    }
    if (protectedMatchCount > 0) {
        return { eligible: false, reason: 'PROTECTED_MATCH' };
    }
    if (snapshot.hasBracketData) {
        return { eligible: false, reason: 'PROTECTED_BRACKET' };
    }
    return {
        eligible: true,
        reason: 'NO_ACTIVE_REGISTRATION_AFTER_GRACE_PERIOD',
    };
}
function isProtectedRegistrationStatus(status) {
    return CLEANUP_PROTECTED_REGISTRATION_STATUSES.has(status ?? '');
}
//# sourceMappingURL=tournament-cleanup-policy.js.map