"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRefereeInviteRevokedNotification = exports.buildRefereeInviteAcceptedNotification = exports.buildRefereeInviteNotification = exports.buildStaffAddedNotification = exports.buildRefereeAssignedNotification = exports.buildMatchScheduledNotification = exports.buildMatchCompletedNotification = exports.buildPayoutReviewedNotification = exports.buildUserUnbannedNotification = exports.buildUserBannedNotification = exports.buildVerificationRejectedNotification = exports.buildVerificationApprovedNotification = exports.buildTournamentDeleteRejectedNotification = exports.buildTournamentDeleteApprovedNotification = exports.buildTournamentUnsuspendedNotification = exports.buildTournamentSuspendedNotification = exports.buildTournamentPublishRejectedNotification = exports.buildTournamentPublishApprovedNotification = exports.buildOrganizerPaymentCompletedNotification = exports.buildTournamentCancelledNotification = exports.buildReservedSlotAssignedNotification = exports.buildParticipantPaymentCompletedNotification = exports.buildRegistrationTimeoutNotification = exports.buildRegistrationCancelledFullNotification = exports.buildParticipantKickedNotification = exports.buildParticipantWithdrawnNotification = exports.buildPartnerInviteCancelledNotification = exports.buildPartnerInviteRejectedNotification = exports.buildPartnerInviteAcceptedNotification = exports.buildPartnerInviteReceivedNotification = exports.buildParticipantTeammateJoinedNotification = exports.buildParticipantPendingTeammateNotification = exports.buildParticipantRegistrationRejectedNotification = exports.buildParticipantRegistrationSuccessNotification = exports.buildParticipantRegistrationPendingNotification = exports.buildOrganizerTeamCompletedNotification = exports.buildOrganizerNewRegistrationNotification = exports.buildCommunityPostApprovedNotification = exports.buildCommunityPostCommentedNotification = exports.buildCommunityPostMentionedNotification = exports.buildCommunityUnbannedNotification = exports.buildCommunityBannedNotification = exports.buildCommunityOwnershipTransferredNotification = exports.buildCommunityInviteRevokedNotification = exports.buildCommunityKickedNotification = exports.buildCommunityRoleDemotedNotification = exports.buildCommunityRolePromotedNotification = exports.buildCommunityInviteNotification = exports.buildFootballRosterConfirmationNotification = exports.buildFootballTeamNotification = void 0;
exports.buildRefereeInviteDeclinedNotification = void 0;
const notification_types_1 = require("./notification-types");
const getCommunityRedirect = (communityId) => `/communities/${communityId}`;
const getFootballTeamRedirect = (teamId) => `/football-teams?teamId=${encodeURIComponent(teamId)}`;
const buildFootballTeamNotification = (params) => {
    const copy = {
        FOOTBALL_TEAM_INVITED: ['Lời mời tham gia đội bóng', `Bạn được mời tham gia ${params.teamName}.`],
        FOOTBALL_TEAM_INVITE_ACCEPTED: ['Lời mời đã được chấp nhận', `Một thành viên đã tham gia ${params.teamName}.`],
        FOOTBALL_TEAM_INVITE_DECLINED: ['Lời mời đã bị từ chối', `Lời mời tham gia ${params.teamName} đã bị từ chối.`],
        FOOTBALL_TEAM_INVITE_CANCELLED: ['Lời mời đã được hủy', `Lời mời tham gia ${params.teamName} đã được hủy.`],
        FOOTBALL_TEAM_ROLE_CHANGED: ['Vai trò đội bóng đã thay đổi', `Vai trò của bạn trong ${params.teamName} đã được cập nhật.`],
        FOOTBALL_TEAM_MEMBER_REMOVED: ['Bạn đã rời đội hình', `Bạn đã được xóa khỏi ${params.teamName}.`],
        FOOTBALL_TEAM_MEMBER_LEFT: ['Thành viên đã rời đội', `Một thành viên đã rời ${params.teamName}.`],
    };
    const [title, content] = copy[params.type];
    return {
        receiverId: params.receiverId,
        senderId: params.senderId,
        type: notification_types_1.NOTIFICATION_TYPES[params.type],
        title,
        content,
        redirectUrl: getFootballTeamRedirect(params.teamId),
    };
};
exports.buildFootballTeamNotification = buildFootballTeamNotification;
const buildFootballRosterConfirmationNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.TOURNAMENT_FOOTBALL_ROSTER_CONFIRMATION,
    title: 'Xác nhận đội hình thi đấu',
    content: `Bạn được chọn vào đội hình ${params.tournamentName}. Hãy xác nhận trước khi Ban tổ chức khóa roster.`,
    redirectUrl: getParticipantTournamentRedirect(params.tournamentId, {
        divisionId: params.divisionId,
        tab: 'teams',
        participantId: params.participantId,
    }),
});
exports.buildFootballRosterConfirmationNotification = buildFootballRosterConfirmationNotification;
const buildRedirectPath = (pathname, query) => {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value) {
            searchParams.set(key, value);
        }
    }
    const queryString = searchParams.toString();
    return queryString ? `${pathname}?${queryString}` : pathname;
};
const getTournamentRedirect = (tournamentId, options) => buildRedirectPath(`/tournaments/${tournamentId}`, {
    tab: options?.tab,
    divisionId: options?.divisionId,
    participantId: options?.participantId,
});
const getParticipantTournamentRedirect = (tournamentId, options) => getTournamentRedirect(tournamentId, {
    tab: options?.tab ?? 'teams',
    divisionId: options?.divisionId,
    participantId: options?.participantId,
});
const getOrganizerTournamentRedirect = (tournamentId, options) => buildRedirectPath(`/organizer/tournaments/${tournamentId}/manage`, {
    tab: options?.tab,
    divisionId: options?.divisionId,
});
const buildCommunityInviteNotification = (params) => ({
    receiverId: params.receiverId,
    senderId: params.senderId,
    type: notification_types_1.NOTIFICATION_TYPES.COMMUNITY_INVITED,
    title: 'Bạn có lời mời tham gia cộng đồng',
    content: `${params.inviterName} vừa mời bạn tham gia cộng đồng ${params.communityName}.`,
    redirectUrl: getCommunityRedirect(params.communityId),
});
exports.buildCommunityInviteNotification = buildCommunityInviteNotification;
const buildCommunityRolePromotedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.COMMUNITY_ROLE_PROMOTED,
    title: 'Vai trò của bạn đã được cập nhật',
    content: `Bạn đã được thăng quyền thành ${params.roleLabel} trong cộng đồng ${params.communityName}.`,
    redirectUrl: getCommunityRedirect(params.communityId),
});
exports.buildCommunityRolePromotedNotification = buildCommunityRolePromotedNotification;
const buildCommunityRoleDemotedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.COMMUNITY_ROLE_DEMOTED,
    title: 'Vai trò của bạn đã bị điều chỉnh',
    content: `Vai trò của bạn trong cộng đồng ${params.communityName} đã được chuyển thành ${params.roleLabel}.`,
    redirectUrl: getCommunityRedirect(params.communityId),
});
exports.buildCommunityRoleDemotedNotification = buildCommunityRoleDemotedNotification;
const buildCommunityKickedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.COMMUNITY_KICKED,
    title: 'Bạn đã bị mời ra khỏi cộng đồng',
    content: `Bạn không còn là thành viên của cộng đồng ${params.communityName}.`,
    redirectUrl: getCommunityRedirect(params.communityId),
});
exports.buildCommunityKickedNotification = buildCommunityKickedNotification;
const buildCommunityInviteRevokedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.COMMUNITY_INVITE_REVOKED,
    title: 'Lời mời tham gia cộng đồng đã bị thu hồi',
    content: `Lời mời tham gia cộng đồng ${params.communityName} không còn hiệu lực nữa.`,
    redirectUrl: getCommunityRedirect(params.communityId),
});
exports.buildCommunityInviteRevokedNotification = buildCommunityInviteRevokedNotification;
const buildCommunityOwnershipTransferredNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.COMMUNITY_OWNERSHIP_TRANSFERRED,
    title: 'Bạn đã trở thành chủ sở hữu cộng đồng',
    content: `Bạn vừa được chuyển quyền sở hữu cộng đồng ${params.communityName}.`,
    redirectUrl: getCommunityRedirect(params.communityId),
});
exports.buildCommunityOwnershipTransferredNotification = buildCommunityOwnershipTransferredNotification;
const buildCommunityBannedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.COMMUNITY_BANNED,
    title: 'Bạn đã bị cấm khỏi cộng đồng',
    content: `Bạn không thể tiếp tục tham gia cộng đồng ${params.communityName} cho đến khi được gỡ cấm.`,
    redirectUrl: getCommunityRedirect(params.communityId),
});
exports.buildCommunityBannedNotification = buildCommunityBannedNotification;
const buildCommunityUnbannedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.COMMUNITY_UNBANNED,
    title: 'Bạn đã được gỡ cấm khỏi cộng đồng',
    content: `Bạn có thể tham gia lại cộng đồng ${params.communityName}.`,
    redirectUrl: getCommunityRedirect(params.communityId),
});
exports.buildCommunityUnbannedNotification = buildCommunityUnbannedNotification;
const buildCommunityPostMentionedNotification = (params) => ({
    receiverId: params.receiverId,
    senderId: params.senderId,
    type: notification_types_1.NOTIFICATION_TYPES.COMMUNITY_POST_MENTIONED,
    title: 'Bạn được nhắc tên trong bài viết CLB',
    content: `${params.senderName} vừa nhắc đến bạn trong một bài viết tại CLB ${params.communityName}.`,
    redirectUrl: getCommunityRedirect(params.communityId),
});
exports.buildCommunityPostMentionedNotification = buildCommunityPostMentionedNotification;
const buildCommunityPostCommentedNotification = (params) => ({
    receiverId: params.receiverId,
    senderId: params.senderId,
    type: notification_types_1.NOTIFICATION_TYPES.COMMUNITY_POST_COMMENTED,
    title: 'Bài viết của bạn có bình luận mới',
    content: `${params.senderName} vừa bình luận vào bài viết của bạn tại CLB ${params.communityName}.`,
    redirectUrl: getCommunityRedirect(params.communityId),
});
exports.buildCommunityPostCommentedNotification = buildCommunityPostCommentedNotification;
const buildCommunityPostApprovedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.COMMUNITY_POST_APPROVED,
    title: 'Bài viết CLB đã được duyệt',
    content: `Bài viết của bạn tại CLB ${params.communityName} đã được duyệt và hiển thị trên bảng tin.`,
    redirectUrl: getCommunityRedirect(params.communityId),
});
exports.buildCommunityPostApprovedNotification = buildCommunityPostApprovedNotification;
const buildOrganizerNewRegistrationNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.TOURNAMENT_PARTICIPANT_NEW,
    title: 'Có đăng ký mới vào giải đấu',
    content: `Đội/VĐV ${params.teamName} vừa đăng ký tham gia giải ${params.tournamentName}.`,
    redirectUrl: getOrganizerTournamentRedirect(params.tournamentId, {
        tab: 'registration',
        divisionId: params.divisionId ?? undefined,
    }),
});
exports.buildOrganizerNewRegistrationNotification = buildOrganizerNewRegistrationNotification;
const buildOrganizerTeamCompletedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.TOURNAMENT_TEAM_COMPLETED,
    title: 'Đội đôi đã hoàn tất thành viên',
    content: `Đội ${params.teamName} đã đủ thành viên tại giải ${params.tournamentName}.`,
    redirectUrl: getOrganizerTournamentRedirect(params.tournamentId, {
        tab: 'registration',
        divisionId: params.divisionId ?? undefined,
    }),
});
exports.buildOrganizerTeamCompletedNotification = buildOrganizerTeamCompletedNotification;
const buildParticipantRegistrationPendingNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.TOURNAMENT_REGISTER_PENDING,
    title: 'Đăng ký đang chờ duyệt',
    content: `Đơn đăng ký giải ${params.tournamentName} của bạn đang chờ Ban tổ chức xác nhận.`,
    redirectUrl: getParticipantTournamentRedirect(params.tournamentId, {
        divisionId: params.divisionId ?? undefined,
    }),
});
exports.buildParticipantRegistrationPendingNotification = buildParticipantRegistrationPendingNotification;
const buildParticipantRegistrationSuccessNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.TOURNAMENT_REGISTER_SUCCESS,
    title: 'Đăng ký giải đấu thành công',
    content: `Bạn đã đăng ký thành công giải đấu ${params.tournamentName}.`,
    redirectUrl: getParticipantTournamentRedirect(params.tournamentId, {
        divisionId: params.divisionId ?? undefined,
    }),
});
exports.buildParticipantRegistrationSuccessNotification = buildParticipantRegistrationSuccessNotification;
const buildParticipantRegistrationRejectedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.TOURNAMENT_REGISTER_REJECTED,
    title: 'Đơn đăng ký bị từ chối',
    content: `Đơn đăng ký tham gia giải đấu ${params.tournamentName} của bạn đã bị từ chối.`,
    redirectUrl: getParticipantTournamentRedirect(params.tournamentId, {
        divisionId: params.divisionId ?? undefined,
    }),
});
exports.buildParticipantRegistrationRejectedNotification = buildParticipantRegistrationRejectedNotification;
const buildParticipantPendingTeammateNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.TOURNAMENT_TEAM_PENDING,
    title: 'Đang chờ đồng đội xác nhận',
    content: `Đội của bạn tại giải ${params.tournamentName} đang chờ đồng đội tham gia để hoàn tất đăng ký.`,
    redirectUrl: getParticipantTournamentRedirect(params.tournamentId, {
        divisionId: params.divisionId ?? undefined,
    }),
});
exports.buildParticipantPendingTeammateNotification = buildParticipantPendingTeammateNotification;
const buildParticipantTeammateJoinedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.TOURNAMENT_TEAMMATE_JOINED,
    title: 'Đồng đội đã tham gia đội thi đấu',
    content: `Đội của bạn tại giải ${params.tournamentName} đã có đủ thành viên.`,
    redirectUrl: getParticipantTournamentRedirect(params.tournamentId, {
        divisionId: params.divisionId ?? undefined,
    }),
});
exports.buildParticipantTeammateJoinedNotification = buildParticipantTeammateJoinedNotification;
const buildPartnerInviteReceivedNotification = (params) => ({
    receiverId: params.receiverId,
    senderId: params.senderId,
    type: notification_types_1.NOTIFICATION_TYPES.PARTNER_INVITE_RECEIVED,
    title: 'Bạn có lời mời ghép đôi!',
    content: `${params.tournamentName}: ${params.teamName} mời bạn làm đồng đội. Xác nhận trong tối đa 1 giờ hoặc trước khi đóng đăng ký.`,
    redirectUrl: `/tournaments/${params.tournamentId}/participants/${params.participantId}/accept-partner`,
});
exports.buildPartnerInviteReceivedNotification = buildPartnerInviteReceivedNotification;
const buildPartnerInviteAcceptedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.PARTNER_INVITE_ACCEPTED,
    title: 'Đồng đội đã chấp nhận lời mời ghép đôi!',
    content: 'Đồng đội của bạn đã đồng ý tham gia giải đấu. Đội của bạn hiện đã hợp lệ!',
    redirectUrl: `/tournaments/${params.tournamentId}/register${params.divisionId ? `?divisionId=${params.divisionId}` : ''}`,
});
exports.buildPartnerInviteAcceptedNotification = buildPartnerInviteAcceptedNotification;
const buildPartnerInviteRejectedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.PARTNER_INVITE_REJECTED,
    title: 'Lời mời ghép đôi đã bị từ chối',
    content: 'Đồng đội đã từ chối lời mời hoặc thời hạn ghép đôi đã kết thúc. Suất giữ chỗ đã được giải phóng.',
    redirectUrl: `/tournaments/${params.tournamentId}/register${params.divisionId ? `?divisionId=${params.divisionId}` : ''}`,
});
exports.buildPartnerInviteRejectedNotification = buildPartnerInviteRejectedNotification;
const buildPartnerInviteCancelledNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.PARTNER_INVITE_CANCELLED,
    title: 'Lời mời ghép đôi đã bị thu hồi',
    content: 'Đồng đội đã hủy lời mời ghép đôi hoặc đội đã rút khỏi giải đấu. Lời mời không còn hiệu lực.',
    redirectUrl: getParticipantTournamentRedirect(params.tournamentId, {
        divisionId: params.divisionId ?? undefined,
    }),
});
exports.buildPartnerInviteCancelledNotification = buildPartnerInviteCancelledNotification;
const buildParticipantWithdrawnNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.TOURNAMENT_WITHDRAWN,
    title: 'Có vận động viên rút đăng ký',
    content: `Đội/VĐV ${params.teamName} đã rút khỏi giải ${params.tournamentName}.`,
    redirectUrl: getOrganizerTournamentRedirect(params.tournamentId, {
        tab: 'registration',
        divisionId: params.divisionId ?? undefined,
    }),
});
exports.buildParticipantWithdrawnNotification = buildParticipantWithdrawnNotification;
const buildParticipantKickedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.TOURNAMENT_KICKED,
    title: 'Bị loại khỏi giải đấu',
    content: `Đơn đăng ký tham gia giải đấu ${params.tournamentName} của bạn đã bị loại.${params.reason ? ` Lý do: ${params.reason}.` : ''}`,
    redirectUrl: getParticipantTournamentRedirect(params.tournamentId, {
        divisionId: params.divisionId ?? undefined,
    }),
});
exports.buildParticipantKickedNotification = buildParticipantKickedNotification;
const buildRegistrationCancelledFullNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.TOURNAMENT_FULL_CANCELLED,
    title: 'Hủy đăng ký do giải đấu đã đầy',
    content: 'Đơn đăng ký Đôi của bạn đã bị hủy vì giải đấu đã đạt số lượng slot tối đa.',
    redirectUrl: getParticipantTournamentRedirect(params.tournamentId, {
        divisionId: params.divisionId ?? undefined,
    }),
});
exports.buildRegistrationCancelledFullNotification = buildRegistrationCancelledFullNotification;
const buildRegistrationTimeoutNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.TOURNAMENT_TEAM_TIMEOUT,
    title: 'Hủy đăng ký Đôi do hết hạn xác nhận',
    content: `Đăng ký Đôi của bạn tại giải đấu ${params.tournamentName} đã bị hủy do đồng đội không xác nhận tham gia kịp thời.`,
    redirectUrl: getParticipantTournamentRedirect(params.tournamentId, {
        divisionId: params.divisionId ?? undefined,
    }),
});
exports.buildRegistrationTimeoutNotification = buildRegistrationTimeoutNotification;
const buildParticipantPaymentCompletedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.TOURNAMENT_PAYMENT_COMPLETED,
    title: 'Thanh toán đăng ký đã hoàn tất',
    content: `Thanh toán cho giải đấu ${params.tournamentName} của bạn đã được xác nhận thành công.`,
    redirectUrl: getParticipantTournamentRedirect(params.tournamentId, {
        divisionId: params.divisionId ?? undefined,
    }),
});
exports.buildParticipantPaymentCompletedNotification = buildParticipantPaymentCompletedNotification;
const buildReservedSlotAssignedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.TOURNAMENT_RESERVED_SLOT_ASSIGNED,
    title: 'Bạn đã được giữ chỗ vào giải đấu',
    content: `Ban tổ chức vừa thêm bạn vào danh sách tham gia giải ${params.tournamentName}.`,
    redirectUrl: getParticipantTournamentRedirect(params.tournamentId, {
        divisionId: params.divisionId ?? undefined,
    }),
});
exports.buildReservedSlotAssignedNotification = buildReservedSlotAssignedNotification;
const buildTournamentCancelledNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.TOURNAMENT_CANCELLED,
    title: 'Giải đấu đã bị hủy',
    content: `Giải đấu ${params.tournamentName} đã bị hủy. Nếu bạn đã thanh toán, hệ thống sẽ xử lý hoàn tiền theo quy định.`,
    redirectUrl: getParticipantTournamentRedirect(params.tournamentId, {
        divisionId: params.divisionId ?? undefined,
    }),
});
exports.buildTournamentCancelledNotification = buildTournamentCancelledNotification;
const buildOrganizerPaymentCompletedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.TOURNAMENT_PAYMENT_COMPLETED,
    title: 'Có vận động viên đã thanh toán',
    content: `Một lượt đăng ký tại giải ${params.tournamentName} vừa hoàn tất thanh toán.`,
    redirectUrl: getOrganizerTournamentRedirect(params.tournamentId, {
        tab: 'finance',
        divisionId: params.divisionId ?? undefined,
    }),
});
exports.buildOrganizerPaymentCompletedNotification = buildOrganizerPaymentCompletedNotification;
const buildTournamentPublishApprovedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.TOURNAMENT_PUBLISH_APPROVED,
    title: 'Giải đấu đã được duyệt mở đăng ký',
    content: `Giải ${params.tournamentName} đã được hệ thống mở đăng ký thành công.`,
    redirectUrl: getOrganizerTournamentRedirect(params.tournamentId, { tab: 'basic' }),
});
exports.buildTournamentPublishApprovedNotification = buildTournamentPublishApprovedNotification;
const buildTournamentPublishRejectedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.TOURNAMENT_PUBLISH_REJECTED,
    title: 'Giải đấu không được duyệt',
    content: params.reason
        ? `Giải ${params.tournamentName} chưa được phê duyệt. Lý do: ${params.reason}.`
        : `Giải ${params.tournamentName} chưa được phê duyệt. Vui lòng kiểm tra và cập nhật lại thông tin.`,
    redirectUrl: getOrganizerTournamentRedirect(params.tournamentId, { tab: 'basic' }),
});
exports.buildTournamentPublishRejectedNotification = buildTournamentPublishRejectedNotification;
const buildTournamentSuspendedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.TOURNAMENT_SUSPENDED,
    title: 'Giải đấu bị tạm đình chỉ',
    content: params.reason
        ? `Giải ${params.tournamentName} đã bị tạm đình chỉ. Lý do: ${params.reason}.`
        : `Giải ${params.tournamentName} đã bị tạm đình chỉ bởi quản trị viên.`,
    redirectUrl: getOrganizerTournamentRedirect(params.tournamentId, { tab: 'basic' }),
});
exports.buildTournamentSuspendedNotification = buildTournamentSuspendedNotification;
const buildTournamentUnsuspendedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.TOURNAMENT_UNSUSPENDED,
    title: 'Giải đấu được khôi phục',
    content: `Giải ${params.tournamentName} đã được quản trị viên khôi phục hoạt động.`,
    redirectUrl: getOrganizerTournamentRedirect(params.tournamentId, { tab: 'basic' }),
});
exports.buildTournamentUnsuspendedNotification = buildTournamentUnsuspendedNotification;
const buildTournamentDeleteApprovedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.TOURNAMENT_DELETE_APPROVED,
    title: 'Yêu cầu xóa giải đã được duyệt',
    content: `Yêu cầu xóa giải ${params.tournamentName} của bạn đã được quản trị viên phê duyệt.`,
    redirectUrl: '/organizer/tournaments',
});
exports.buildTournamentDeleteApprovedNotification = buildTournamentDeleteApprovedNotification;
const buildTournamentDeleteRejectedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.TOURNAMENT_DELETE_REJECTED,
    title: 'Yêu cầu xóa giải bị từ chối',
    content: params.reason
        ? `Yêu cầu xóa giải ${params.tournamentName} của bạn đã bị từ chối. Lý do: ${params.reason}.`
        : `Yêu cầu xóa giải ${params.tournamentName} của bạn đã bị từ chối.`,
    redirectUrl: getOrganizerTournamentRedirect(params.tournamentId, { tab: 'basic' }),
});
exports.buildTournamentDeleteRejectedNotification = buildTournamentDeleteRejectedNotification;
const buildVerificationApprovedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.VERIFICATION_APPROVED,
    title: 'Hồ sơ xác minh đã được duyệt',
    content: 'Hồ sơ xác minh của bạn đã được phê duyệt. Bạn có thể truy cập các tính năng dành cho tổ chức.',
    redirectUrl: '/profile',
});
exports.buildVerificationApprovedNotification = buildVerificationApprovedNotification;
const buildVerificationRejectedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.VERIFICATION_REJECTED,
    title: 'Hồ sơ xác minh bị từ chối',
    content: params.reason
        ? `Hồ sơ xác minh của bạn đã bị từ chối. Lý do: ${params.reason}.`
        : 'Hồ sơ xác minh của bạn đã bị từ chối. Vui lòng kiểm tra lại thông tin và gửi lại.',
    redirectUrl: '/profile',
});
exports.buildVerificationRejectedNotification = buildVerificationRejectedNotification;
const buildUserBannedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.USER_BANNED,
    title: 'Tài khoản của bạn bị hạn chế',
    content: params.banType === 'WARN'
        ? `Tài khoản của bạn vừa nhận cảnh báo. Lý do: ${params.reason}.`
        : params.banType === 'SOFT_BAN'
            ? `Tài khoản của bạn vừa bị tạm khóa. Lý do: ${params.reason}.`
            : `Tài khoản của bạn vừa bị khóa vĩnh viễn. Lý do: ${params.reason}.`,
    redirectUrl: '/profile',
});
exports.buildUserBannedNotification = buildUserBannedNotification;
const buildUserUnbannedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.USER_UNBANNED,
    title: 'Tài khoản đã được khôi phục',
    content: 'Tài khoản của bạn đã được khôi phục trạng thái hoạt động.',
    redirectUrl: '/profile',
});
exports.buildUserUnbannedNotification = buildUserUnbannedNotification;
const buildPayoutReviewedNotification = (params) => ({
    receiverId: params.receiverId,
    type: params.approved
        ? notification_types_1.NOTIFICATION_TYPES.PAYOUT_APPROVED
        : notification_types_1.NOTIFICATION_TYPES.PAYOUT_REJECTED,
    title: params.approved
        ? 'Yêu cầu rút tiền đã được duyệt'
        : 'Yêu cầu rút tiền bị từ chối',
    content: params.approved
        ? `Yêu cầu rút tiền của bạn cho giải ${params.tournamentName} đã được quản trị viên phê duyệt.`
        : `Yêu cầu rút tiền của bạn cho giải ${params.tournamentName} đã bị từ chối. Vui lòng kiểm tra lại chi tiết.`,
    redirectUrl: '/organizer/payouts',
});
exports.buildPayoutReviewedNotification = buildPayoutReviewedNotification;
const buildMatchCompletedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.MATCH_COMPLETED,
    title: 'Trận đấu đã hoàn thành',
    content: `Trận đấu của bạn tại giải ${params.tournamentName} đã có kết quả. Xem ngay!`,
    redirectUrl: getTournamentRedirect(params.tournamentId, {
        tab: 'bracket',
        divisionId: params.divisionId,
    }),
});
exports.buildMatchCompletedNotification = buildMatchCompletedNotification;
const buildMatchScheduledNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.MATCH_SCHEDULED,
    title: 'Cập nhật lịch thi đấu mới',
    content: `Trận đấu của bạn tại giải ${params.tournamentName} đã được xếp lịch vào lúc ${params.scheduledTime} tại sân ${params.court}. Vui lòng kiểm tra và có mặt đúng giờ.`,
    redirectUrl: getTournamentRedirect(params.tournamentId, {
        tab: 'bracket',
        divisionId: params.divisionId,
    }),
});
exports.buildMatchScheduledNotification = buildMatchScheduledNotification;
const buildRefereeAssignedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.REFEREE_ASSIGNED,
    title: 'Phân công trọng tài bắt chính',
    content: `Bạn đã được phân công bắt chính trận đấu ${params.matchName} vào lúc ${params.scheduledTime}.`,
    redirectUrl: getTournamentRedirect(params.tournamentId, {
        tab: 'matches',
        divisionId: params.divisionId,
    }),
});
exports.buildRefereeAssignedNotification = buildRefereeAssignedNotification;
const buildStaffAddedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.STAFF_ADDED,
    title: 'Bạn được thêm vào ban tổ chức của giải đấu',
    content: `Bạn đã được thêm vào giải ${params.tournamentName} với vai trò ${params.roleLabel}. Giải đấu hiện nằm trong danh sách quản lý của bạn.`,
    redirectUrl: getOrganizerTournamentRedirect(params.tournamentId, {
        tab: 'overview',
    }),
});
exports.buildStaffAddedNotification = buildStaffAddedNotification;
const buildRefereeInviteNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.REFEREE_INVITED,
    title: 'Bạn có lời mời làm trọng tài',
    content: `Ban tổ chức vừa mời bạn tham gia điều hành giải ${params.tournamentName} với vai trò trọng tài.`,
    redirectUrl: buildRedirectPath('/notifications', {
        action: 'referee-invite',
        tournamentId: params.tournamentId,
        refereeId: params.refereeId,
    }),
});
exports.buildRefereeInviteNotification = buildRefereeInviteNotification;
const buildRefereeInviteAcceptedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.REFEREE_INVITE_ACCEPTED,
    title: 'Trọng tài đã nhận lời mời',
    content: `${params.refereeName} đã đồng ý tham gia điều hành giải ${params.tournamentName}.`,
    redirectUrl: getOrganizerTournamentRedirect(params.tournamentId, {
        tab: 'permissions',
    }),
});
exports.buildRefereeInviteAcceptedNotification = buildRefereeInviteAcceptedNotification;
const buildRefereeInviteRevokedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.REFEREE_INVITE_REVOKED,
    title: 'Lời mời trọng tài đã bị thu hồi',
    content: `Ban tổ chức đã thu hồi lời mời trọng tài của bạn tại giải ${params.tournamentName}.`,
    redirectUrl: getTournamentRedirect(params.tournamentId, {
        tab: 'overview',
    }),
});
exports.buildRefereeInviteRevokedNotification = buildRefereeInviteRevokedNotification;
const buildRefereeInviteDeclinedNotification = (params) => ({
    receiverId: params.receiverId,
    type: notification_types_1.NOTIFICATION_TYPES.REFEREE_INVITE_DECLINED,
    title: 'Trọng tài đã từ chối lời mời',
    content: `${params.refereeName} đã từ chối vai trò trọng tài tại giải ${params.tournamentName}.`,
    redirectUrl: getOrganizerTournamentRedirect(params.tournamentId, {
        tab: 'permissions',
    }),
});
exports.buildRefereeInviteDeclinedNotification = buildRefereeInviteDeclinedNotification;
//# sourceMappingURL=notification-builder.js.map