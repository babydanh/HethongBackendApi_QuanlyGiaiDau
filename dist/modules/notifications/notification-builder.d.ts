import type { CreateNotificationDto } from './dto/create-notification.dto';
export declare const getFootballTeamRedirect: (teamId: string) => string;
export declare const buildFootballTeamNotification: (params: {
    teamId: string;
    teamName: string;
    receiverId: string;
    senderId?: string;
    type: "FOOTBALL_TEAM_INVITED" | "FOOTBALL_TEAM_INVITE_ACCEPTED" | "FOOTBALL_TEAM_INVITE_DECLINED" | "FOOTBALL_TEAM_INVITE_CANCELLED" | "FOOTBALL_TEAM_ROLE_CHANGED" | "FOOTBALL_TEAM_MEMBER_REMOVED" | "FOOTBALL_TEAM_MEMBER_LEFT";
}) => CreateNotificationDto;
export declare const buildFootballRosterConfirmationNotification: (params: {
    tournamentId: string;
    tournamentName: string;
    receiverId: string;
    divisionId?: string;
    participantId?: string;
}) => CreateNotificationDto;
export declare const buildCommunityInviteNotification: (params: {
    communityId: string;
    communityName: string;
    inviterName: string;
    receiverId: string;
    senderId?: string;
}) => CreateNotificationDto;
export declare const buildCommunityRolePromotedNotification: (params: {
    communityId: string;
    communityName: string;
    receiverId: string;
    roleLabel: string;
}) => CreateNotificationDto;
export declare const buildCommunityRoleDemotedNotification: (params: {
    communityId: string;
    communityName: string;
    receiverId: string;
    roleLabel: string;
}) => CreateNotificationDto;
export declare const buildCommunityKickedNotification: (params: {
    communityId: string;
    communityName: string;
    receiverId: string;
}) => CreateNotificationDto;
export declare const buildCommunityInviteRevokedNotification: (params: {
    communityId: string;
    communityName: string;
    receiverId: string;
}) => CreateNotificationDto;
export declare const buildCommunityOwnershipTransferredNotification: (params: {
    communityId: string;
    communityName: string;
    receiverId: string;
}) => CreateNotificationDto;
export declare const buildCommunityBannedNotification: (params: {
    communityId: string;
    communityName: string;
    receiverId: string;
}) => CreateNotificationDto;
export declare const buildCommunityUnbannedNotification: (params: {
    communityId: string;
    communityName: string;
    receiverId: string;
}) => CreateNotificationDto;
export declare const buildCommunityPostMentionedNotification: (params: {
    communityId: string;
    communityName: string;
    senderName: string;
    receiverId: string;
    senderId?: string;
    postId?: string;
}) => CreateNotificationDto;
export declare const buildCommunityPostCommentedNotification: (params: {
    communityId: string;
    communityName: string;
    senderName: string;
    receiverId: string;
    senderId?: string;
    postId?: string;
}) => CreateNotificationDto;
export declare const buildCommunityPostApprovedNotification: (params: {
    communityId: string;
    communityName: string;
    receiverId: string;
    postId?: string;
}) => CreateNotificationDto;
export declare const buildOrganizerNewRegistrationNotification: (params: {
    tournamentId: string;
    tournamentName: string;
    receiverId: string;
    teamName: string;
    divisionId?: string | null;
}) => CreateNotificationDto;
export declare const buildOrganizerTeamCompletedNotification: (params: {
    tournamentId: string;
    tournamentName: string;
    receiverId: string;
    teamName: string;
    divisionId?: string | null;
}) => CreateNotificationDto;
export declare const buildParticipantRegistrationPendingNotification: (params: {
    tournamentId: string;
    tournamentName: string;
    receiverId: string;
    divisionId?: string | null;
}) => CreateNotificationDto;
export declare const buildParticipantRegistrationSuccessNotification: (params: {
    tournamentId: string;
    tournamentName: string;
    receiverId: string;
    divisionId?: string | null;
}) => CreateNotificationDto;
export declare const buildParticipantRegistrationRejectedNotification: (params: {
    tournamentId: string;
    tournamentName: string;
    receiverId: string;
    divisionId?: string | null;
}) => CreateNotificationDto;
export declare const buildParticipantPendingTeammateNotification: (params: {
    tournamentId: string;
    tournamentName: string;
    receiverId: string;
    divisionId?: string | null;
}) => CreateNotificationDto;
export declare const buildParticipantTeammateJoinedNotification: (params: {
    tournamentId: string;
    tournamentName: string;
    receiverId: string;
    divisionId?: string | null;
}) => CreateNotificationDto;
export declare const buildPartnerInviteReceivedNotification: (params: {
    tournamentId: string;
    tournamentName: string;
    receiverId: string;
    senderId: string;
    teamName: string;
    participantId: string;
}) => CreateNotificationDto;
export declare const buildPartnerInviteAcceptedNotification: (params: {
    tournamentId: string;
    receiverId: string;
    divisionId?: string | null;
}) => CreateNotificationDto;
export declare const buildPartnerInviteRejectedNotification: (params: {
    tournamentId: string;
    receiverId: string;
    divisionId?: string | null;
}) => CreateNotificationDto;
export declare const buildPartnerInviteCancelledNotification: (params: {
    tournamentId: string;
    receiverId: string;
    divisionId?: string | null;
}) => CreateNotificationDto;
export declare const buildParticipantWithdrawnNotification: (params: {
    tournamentId: string;
    tournamentName: string;
    receiverId: string;
    teamName: string;
    divisionId?: string | null;
}) => CreateNotificationDto;
export declare const buildParticipantKickedNotification: (params: {
    tournamentId: string;
    tournamentName: string;
    receiverId: string;
    reason?: string;
    divisionId?: string | null;
}) => CreateNotificationDto;
export declare const buildRegistrationCancelledFullNotification: (params: {
    tournamentId: string;
    receiverId: string;
    divisionId?: string | null;
}) => CreateNotificationDto;
export declare const buildRegistrationTimeoutNotification: (params: {
    tournamentId: string;
    tournamentName: string;
    receiverId: string;
    divisionId?: string | null;
}) => CreateNotificationDto;
export declare const buildParticipantPaymentCompletedNotification: (params: {
    tournamentId: string;
    tournamentName: string;
    receiverId: string;
    divisionId?: string | null;
}) => CreateNotificationDto;
export declare const buildReservedSlotAssignedNotification: (params: {
    tournamentId: string;
    tournamentName: string;
    receiverId: string;
    divisionId?: string | null;
}) => CreateNotificationDto;
export declare const buildTournamentCancelledNotification: (params: {
    tournamentId: string;
    tournamentName: string;
    receiverId: string;
    divisionId?: string | null;
}) => CreateNotificationDto;
export declare const buildOrganizerPaymentCompletedNotification: (params: {
    tournamentId: string;
    tournamentName: string;
    receiverId: string;
    divisionId?: string | null;
}) => CreateNotificationDto;
export declare const buildTournamentPublishApprovedNotification: (params: {
    tournamentId: string;
    tournamentName: string;
    receiverId: string;
}) => CreateNotificationDto;
export declare const buildTournamentPublishRejectedNotification: (params: {
    tournamentId: string;
    tournamentName: string;
    receiverId: string;
    reason?: string;
}) => CreateNotificationDto;
export declare const buildTournamentSuspendedNotification: (params: {
    tournamentId: string;
    tournamentName: string;
    receiverId: string;
    reason?: string;
}) => CreateNotificationDto;
export declare const buildTournamentUnsuspendedNotification: (params: {
    tournamentId: string;
    tournamentName: string;
    receiverId: string;
}) => CreateNotificationDto;
export declare const buildTournamentDeleteApprovedNotification: (params: {
    tournamentName: string;
    receiverId: string;
}) => CreateNotificationDto;
export declare const buildTournamentDeleteRejectedNotification: (params: {
    tournamentId: string;
    tournamentName: string;
    receiverId: string;
    reason?: string;
}) => CreateNotificationDto;
export declare const buildVerificationApprovedNotification: (params: {
    receiverId: string;
}) => CreateNotificationDto;
export declare const buildVerificationRejectedNotification: (params: {
    receiverId: string;
    reason?: string;
}) => CreateNotificationDto;
export declare const buildUserBannedNotification: (params: {
    receiverId: string;
    reason: string;
    banType: "WARN" | "SOFT_BAN" | "HARD_BAN";
}) => CreateNotificationDto;
export declare const buildUserUnbannedNotification: (params: {
    receiverId: string;
}) => CreateNotificationDto;
export declare const buildPayoutReviewedNotification: (params: {
    tournamentId: string;
    tournamentName: string;
    receiverId: string;
    approved: boolean;
}) => CreateNotificationDto;
export declare const buildMatchCompletedNotification: (params: {
    matchId: string;
    tournamentId: string;
    tournamentName: string;
    receiverId: string;
    divisionId?: string;
}) => CreateNotificationDto;
export declare const buildMatchScheduledNotification: (params: {
    matchId: string;
    tournamentId: string;
    tournamentName: string;
    receiverId: string;
    court: string;
    scheduledTime: string;
    divisionId?: string;
    bracketBranch?: string | null;
    roundNumber?: number | null;
}) => CreateNotificationDto;
export declare const buildMatchReminderNotification: (params: {
    matchId: string;
    tournamentName: string;
    receiverId: string;
    scheduledTime: string;
    court: string;
    untilLabel: string;
    bracketBranch?: string | null;
    roundNumber?: number | null;
}) => CreateNotificationDto;
export declare const buildRefereeAssignedNotification: (params: {
    tournamentId: string;
    receiverId: string;
    matchName: string;
    scheduledTime: string;
    divisionId?: string;
}) => CreateNotificationDto;
export declare const buildStaffAddedNotification: (params: {
    tournamentId: string;
    tournamentName: string;
    receiverId: string;
    roleLabel: string;
}) => CreateNotificationDto;
export declare const buildRefereeInviteNotification: (params: {
    tournamentId: string;
    tournamentName: string;
    receiverId: string;
    refereeId: string;
}) => CreateNotificationDto;
export declare const buildRefereeInviteAcceptedNotification: (params: {
    tournamentId: string;
    tournamentName: string;
    receiverId: string;
    refereeName: string;
}) => CreateNotificationDto;
export declare const buildRefereeInviteRevokedNotification: (params: {
    tournamentId: string;
    tournamentName: string;
    receiverId: string;
}) => CreateNotificationDto;
export declare const buildRefereeInviteDeclinedNotification: (params: {
    tournamentId: string;
    tournamentName: string;
    receiverId: string;
    refereeName: string;
}) => CreateNotificationDto;
