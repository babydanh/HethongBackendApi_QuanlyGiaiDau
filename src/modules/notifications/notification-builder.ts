import type { CreateNotificationDto } from './dto/create-notification.dto';
import { NOTIFICATION_TYPES } from './notification-types';

const getCommunityRedirect = (communityId: string): string => `/communities/${communityId}`;

const buildRedirectPath = (
  pathname: string,
  query: Record<string, string | undefined>,
): string => {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const queryString = searchParams.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
};

const getTournamentRedirect = (
  tournamentId: string,
  options?: { tab?: string; divisionId?: string },
): string =>
  buildRedirectPath(`/tournaments/${tournamentId}`, {
    tab: options?.tab,
    divisionId: options?.divisionId,
  });

const getParticipantTournamentRedirect = (
  tournamentId: string,
  options?: { divisionId?: string; tab?: 'teams' | 'bracket' | 'matches' },
): string =>
  getTournamentRedirect(tournamentId, {
    tab: options?.tab ?? 'teams',
    divisionId: options?.divisionId,
  });

const getOrganizerTournamentRedirect = (
  tournamentId: string,
  options?: {
    tab?: 'basic' | 'schedule' | 'registration' | 'bracket' | 'finance' | 'permissions';
    divisionId?: string;
  },
): string =>
  buildRedirectPath(`/organizer/tournaments/${tournamentId}/manage`, {
    tab: options?.tab,
    divisionId: options?.divisionId,
  });

export const buildCommunityInviteNotification = (params: {
  communityId: string;
  communityName: string;
  inviterName: string;
  receiverId: string;
  senderId?: string;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  senderId: params.senderId,
  type: NOTIFICATION_TYPES.COMMUNITY_INVITED,
  title: 'Bạn có lời mời tham gia cộng đồng',
  content: `${params.inviterName} vừa mời bạn tham gia cộng đồng ${params.communityName}.`,
  redirectUrl: getCommunityRedirect(params.communityId),
});

export const buildCommunityRolePromotedNotification = (params: {
  communityId: string;
  communityName: string;
  receiverId: string;
  roleLabel: string;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.COMMUNITY_ROLE_PROMOTED,
  title: 'Vai trò của bạn đã được cập nhật',
  content: `Bạn đã được thăng quyền thành ${params.roleLabel} trong cộng đồng ${params.communityName}.`,
  redirectUrl: getCommunityRedirect(params.communityId),
});

export const buildCommunityRoleDemotedNotification = (params: {
  communityId: string;
  communityName: string;
  receiverId: string;
  roleLabel: string;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.COMMUNITY_ROLE_DEMOTED,
  title: 'Vai trò của bạn đã bị điều chỉnh',
  content: `Vai trò của bạn trong cộng đồng ${params.communityName} đã được chuyển thành ${params.roleLabel}.`,
  redirectUrl: getCommunityRedirect(params.communityId),
});

export const buildCommunityKickedNotification = (params: {
  communityId: string;
  communityName: string;
  receiverId: string;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.COMMUNITY_KICKED,
  title: 'Bạn đã bị mời ra khỏi cộng đồng',
  content: `Bạn không còn là thành viên của cộng đồng ${params.communityName}.`,
  redirectUrl: getCommunityRedirect(params.communityId),
});

export const buildCommunityInviteRevokedNotification = (params: {
  communityId: string;
  communityName: string;
  receiverId: string;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.COMMUNITY_INVITE_REVOKED,
  title: 'Lời mời tham gia cộng đồng đã bị thu hồi',
  content: `Lời mời tham gia cộng đồng ${params.communityName} không còn hiệu lực nữa.`,
  redirectUrl: getCommunityRedirect(params.communityId),
});

export const buildCommunityOwnershipTransferredNotification = (params: {
  communityId: string;
  communityName: string;
  receiverId: string;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.COMMUNITY_OWNERSHIP_TRANSFERRED,
  title: 'Bạn đã trở thành chủ sở hữu cộng đồng',
  content: `Bạn vừa được chuyển quyền sở hữu cộng đồng ${params.communityName}.`,
  redirectUrl: getCommunityRedirect(params.communityId),
});

export const buildCommunityBannedNotification = (params: {
  communityId: string;
  communityName: string;
  receiverId: string;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.COMMUNITY_BANNED,
  title: 'Bạn đã bị cấm khỏi cộng đồng',
  content: `Bạn không thể tiếp tục tham gia cộng đồng ${params.communityName} cho đến khi được gỡ cấm.`,
  redirectUrl: getCommunityRedirect(params.communityId),
});

export const buildCommunityUnbannedNotification = (params: {
  communityId: string;
  communityName: string;
  receiverId: string;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.COMMUNITY_UNBANNED,
  title: 'Bạn đã được gỡ cấm khỏi cộng đồng',
  content: `Bạn có thể tham gia lại cộng đồng ${params.communityName}.`,
  redirectUrl: getCommunityRedirect(params.communityId),
});

export const buildOrganizerNewRegistrationNotification = (params: {
  tournamentId: string;
  tournamentName: string;
  receiverId: string;
  teamName: string;
  divisionId?: string | null;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.TOURNAMENT_PARTICIPANT_NEW,
  title: 'Có đăng ký mới vào giải đấu',
  content: `Đội/VĐV ${params.teamName} vừa đăng ký tham gia giải ${params.tournamentName}.`,
  redirectUrl: getOrganizerTournamentRedirect(params.tournamentId, {
    tab: 'registration',
    divisionId: params.divisionId ?? undefined,
  }),
});

export const buildOrganizerTeamCompletedNotification = (params: {
  tournamentId: string;
  tournamentName: string;
  receiverId: string;
  teamName: string;
  divisionId?: string | null;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.TOURNAMENT_TEAM_COMPLETED,
  title: 'Đội đôi đã hoàn tất thành viên',
  content: `Đội ${params.teamName} đã đủ thành viên tại giải ${params.tournamentName}.`,
  redirectUrl: getOrganizerTournamentRedirect(params.tournamentId, {
    tab: 'registration',
    divisionId: params.divisionId ?? undefined,
  }),
});

export const buildParticipantRegistrationPendingNotification = (params: {
  tournamentId: string;
  tournamentName: string;
  receiverId: string;
  divisionId?: string | null;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.TOURNAMENT_REGISTER_PENDING,
  title: 'Đăng ký đang chờ duyệt',
  content: `Đơn đăng ký giải ${params.tournamentName} của bạn đang chờ Ban tổ chức xác nhận.`,
  redirectUrl: getParticipantTournamentRedirect(params.tournamentId, {
    divisionId: params.divisionId ?? undefined,
  }),
});

export const buildParticipantRegistrationSuccessNotification = (params: {
  tournamentId: string;
  tournamentName: string;
  receiverId: string;
  divisionId?: string | null;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.TOURNAMENT_REGISTER_SUCCESS,
  title: 'Đăng ký giải đấu thành công',
  content: `Bạn đã đăng ký thành công giải đấu ${params.tournamentName}.`,
  redirectUrl: getParticipantTournamentRedirect(params.tournamentId, {
    divisionId: params.divisionId ?? undefined,
  }),
});

export const buildParticipantRegistrationRejectedNotification = (params: {
  tournamentId: string;
  tournamentName: string;
  receiverId: string;
  divisionId?: string | null;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.TOURNAMENT_REGISTER_REJECTED,
  title: 'Đơn đăng ký bị từ chối',
  content: `Đơn đăng ký tham gia giải đấu ${params.tournamentName} của bạn đã bị từ chối.`,
  redirectUrl: getParticipantTournamentRedirect(params.tournamentId, {
    divisionId: params.divisionId ?? undefined,
  }),
});

export const buildParticipantPendingTeammateNotification = (params: {
  tournamentId: string;
  tournamentName: string;
  receiverId: string;
  divisionId?: string | null;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.TOURNAMENT_TEAM_PENDING,
  title: 'Đang chờ đồng đội xác nhận',
  content: `Đội của bạn tại giải ${params.tournamentName} đang chờ đồng đội tham gia để hoàn tất đăng ký.`,
  redirectUrl: getParticipantTournamentRedirect(params.tournamentId, {
    divisionId: params.divisionId ?? undefined,
  }),
});

export const buildParticipantTeammateJoinedNotification = (params: {
  tournamentId: string;
  tournamentName: string;
  receiverId: string;
  divisionId?: string | null;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.TOURNAMENT_TEAMMATE_JOINED,
  title: 'Đồng đội đã tham gia đội thi đấu',
  content: `Đội của bạn tại giải ${params.tournamentName} đã có đủ thành viên.`,
  redirectUrl: getParticipantTournamentRedirect(params.tournamentId, {
    divisionId: params.divisionId ?? undefined,
  }),
});

export const buildParticipantWithdrawnNotification = (params: {
  tournamentId: string;
  tournamentName: string;
  receiverId: string;
  teamName: string;
  divisionId?: string | null;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.TOURNAMENT_WITHDRAWN,
  title: 'Có vận động viên rút đăng ký',
  content: `Đội/VĐV ${params.teamName} đã rút khỏi giải ${params.tournamentName}.`,
  redirectUrl: getOrganizerTournamentRedirect(params.tournamentId, {
    tab: 'registration',
    divisionId: params.divisionId ?? undefined,
  }),
});

export const buildParticipantKickedNotification = (params: {
  tournamentId: string;
  tournamentName: string;
  receiverId: string;
  reason?: string;
  divisionId?: string | null;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.TOURNAMENT_KICKED,
  title: 'Bị loại khỏi giải đấu',
  content: `Đơn đăng ký tham gia giải đấu ${params.tournamentName} của bạn đã bị loại.${params.reason ? ` Lý do: ${params.reason}.` : ''}`,
  redirectUrl: getParticipantTournamentRedirect(params.tournamentId, {
    divisionId: params.divisionId ?? undefined,
  }),
});

export const buildRegistrationCancelledFullNotification = (params: {
  tournamentId: string;
  receiverId: string;
  divisionId?: string | null;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.TOURNAMENT_FULL_CANCELLED,
  title: 'Hủy đăng ký do giải đấu đã đầy',
  content: 'Đơn đăng ký Đôi của bạn đã bị hủy vì giải đấu đã đạt số lượng slot tối đa.',
  redirectUrl: getParticipantTournamentRedirect(params.tournamentId, {
    divisionId: params.divisionId ?? undefined,
  }),
});

export const buildRegistrationTimeoutNotification = (params: {
  tournamentId: string;
  tournamentName: string;
  receiverId: string;
  divisionId?: string | null;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.TOURNAMENT_TEAM_TIMEOUT,
  title: 'Hủy đăng ký Đôi do hết hạn xác nhận',
  content: `Đăng ký Đôi của bạn tại giải đấu ${params.tournamentName} đã bị hủy do đồng đội không xác nhận tham gia kịp thời.`,
  redirectUrl: getParticipantTournamentRedirect(params.tournamentId, {
    divisionId: params.divisionId ?? undefined,
  }),
});

export const buildParticipantPaymentCompletedNotification = (params: {
  tournamentId: string;
  tournamentName: string;
  receiverId: string;
  divisionId?: string | null;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.TOURNAMENT_PAYMENT_COMPLETED,
  title: 'Thanh toán đăng ký đã hoàn tất',
  content: `Thanh toán cho giải đấu ${params.tournamentName} của bạn đã được xác nhận thành công.`,
  redirectUrl: getParticipantTournamentRedirect(params.tournamentId, {
    divisionId: params.divisionId ?? undefined,
  }),
});

export const buildReservedSlotAssignedNotification = (params: {
  tournamentId: string;
  tournamentName: string;
  receiverId: string;
  divisionId?: string | null;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.TOURNAMENT_RESERVED_SLOT_ASSIGNED,
  title: 'Bạn đã được giữ chỗ vào giải đấu',
  content: `Ban tổ chức vừa thêm bạn vào danh sách tham gia giải ${params.tournamentName}.`,
  redirectUrl: getParticipantTournamentRedirect(params.tournamentId, {
    divisionId: params.divisionId ?? undefined,
  }),
});

export const buildTournamentCancelledNotification = (params: {
  tournamentId: string;
  tournamentName: string;
  receiverId: string;
  divisionId?: string | null;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.TOURNAMENT_CANCELLED,
  title: 'Giải đấu đã bị hủy',
  content: `Giải đấu ${params.tournamentName} đã bị hủy. Nếu bạn đã thanh toán, hệ thống sẽ xử lý hoàn tiền theo quy định.`,
  redirectUrl: getParticipantTournamentRedirect(params.tournamentId, {
    divisionId: params.divisionId ?? undefined,
  }),
});

export const buildOrganizerPaymentCompletedNotification = (params: {
  tournamentId: string;
  tournamentName: string;
  receiverId: string;
  divisionId?: string | null;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.TOURNAMENT_PAYMENT_COMPLETED,
  title: 'Có vận động viên đã thanh toán',
  content: `Một lượt đăng ký tại giải ${params.tournamentName} vừa hoàn tất thanh toán.`,
  redirectUrl: getOrganizerTournamentRedirect(params.tournamentId, {
    tab: 'finance',
    divisionId: params.divisionId ?? undefined,
  }),
});

export const buildTournamentPublishApprovedNotification = (params: {
  tournamentId: string;
  tournamentName: string;
  receiverId: string;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.TOURNAMENT_PUBLISH_APPROVED,
  title: 'Giải đấu đã được duyệt mở đăng ký',
  content: `Giải ${params.tournamentName} đã được hệ thống mở đăng ký thành công.`,
  redirectUrl: getOrganizerTournamentRedirect(params.tournamentId, { tab: 'basic' }),
});

export const buildTournamentPublishRejectedNotification = (params: {
  tournamentId: string;
  tournamentName: string;
  receiverId: string;
  reason?: string;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.TOURNAMENT_PUBLISH_REJECTED,
  title: 'Giải đấu không được duyệt',
  content: params.reason
    ? `Giải ${params.tournamentName} chưa được phê duyệt. Lý do: ${params.reason}.`
    : `Giải ${params.tournamentName} chưa được phê duyệt. Vui lòng kiểm tra và cập nhật lại thông tin.`,
  redirectUrl: getOrganizerTournamentRedirect(params.tournamentId, { tab: 'basic' }),
});

export const buildTournamentSuspendedNotification = (params: {
  tournamentId: string;
  tournamentName: string;
  receiverId: string;
  reason?: string;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.TOURNAMENT_SUSPENDED,
  title: 'Giải đấu bị tạm đình chỉ',
  content: params.reason
    ? `Giải ${params.tournamentName} đã bị tạm đình chỉ. Lý do: ${params.reason}.`
    : `Giải ${params.tournamentName} đã bị tạm đình chỉ bởi quản trị viên.`,
  redirectUrl: getOrganizerTournamentRedirect(params.tournamentId, { tab: 'basic' }),
});

export const buildTournamentUnsuspendedNotification = (params: {
  tournamentId: string;
  tournamentName: string;
  receiverId: string;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.TOURNAMENT_UNSUSPENDED,
  title: 'Giải đấu được khôi phục',
  content: `Giải ${params.tournamentName} đã được quản trị viên khôi phục hoạt động.`,
  redirectUrl: getOrganizerTournamentRedirect(params.tournamentId, { tab: 'basic' }),
});

export const buildTournamentDeleteApprovedNotification = (params: {
  tournamentName: string;
  receiverId: string;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.TOURNAMENT_DELETE_APPROVED,
  title: 'Yêu cầu xóa giải đã được duyệt',
  content: `Yêu cầu xóa giải ${params.tournamentName} của bạn đã được quản trị viên phê duyệt.`,
  redirectUrl: '/organizer/tournaments',
});

export const buildTournamentDeleteRejectedNotification = (params: {
  tournamentId: string;
  tournamentName: string;
  receiverId: string;
  reason?: string;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.TOURNAMENT_DELETE_REJECTED,
  title: 'Yêu cầu xóa giải bị từ chối',
  content: params.reason
    ? `Yêu cầu xóa giải ${params.tournamentName} của bạn đã bị từ chối. Lý do: ${params.reason}.`
    : `Yêu cầu xóa giải ${params.tournamentName} của bạn đã bị từ chối.`,
  redirectUrl: getOrganizerTournamentRedirect(params.tournamentId, { tab: 'basic' }),
});

export const buildVerificationApprovedNotification = (params: {
  receiverId: string;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.VERIFICATION_APPROVED,
  title: 'Hồ sơ xác minh đã được duyệt',
  content: 'Hồ sơ xác minh của bạn đã được phê duyệt. Bạn có thể truy cập các tính năng dành cho tổ chức.',
  redirectUrl: '/profile',
});

export const buildVerificationRejectedNotification = (params: {
  receiverId: string;
  reason?: string;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.VERIFICATION_REJECTED,
  title: 'Hồ sơ xác minh bị từ chối',
  content: params.reason
    ? `Hồ sơ xác minh của bạn đã bị từ chối. Lý do: ${params.reason}.`
    : 'Hồ sơ xác minh của bạn đã bị từ chối. Vui lòng kiểm tra lại thông tin và gửi lại.',
  redirectUrl: '/profile',
});

export const buildUserBannedNotification = (params: {
  receiverId: string;
  reason: string;
  banType: 'WARN' | 'SOFT_BAN' | 'HARD_BAN';
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.USER_BANNED,
  title: 'Tài khoản của bạn bị hạn chế',
  content:
    params.banType === 'WARN'
      ? `Tài khoản của bạn vừa nhận cảnh báo. Lý do: ${params.reason}.`
      : params.banType === 'SOFT_BAN'
        ? `Tài khoản của bạn vừa bị tạm khóa. Lý do: ${params.reason}.`
        : `Tài khoản của bạn vừa bị khóa vĩnh viễn. Lý do: ${params.reason}.`,
  redirectUrl: '/profile',
});

export const buildUserUnbannedNotification = (params: {
  receiverId: string;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.USER_UNBANNED,
  title: 'Tài khoản đã được khôi phục',
  content: 'Tài khoản của bạn đã được khôi phục trạng thái hoạt động.',
  redirectUrl: '/profile',
});

export const buildPayoutReviewedNotification = (params: {
  tournamentId: string;
  tournamentName: string;
  receiverId: string;
  approved: boolean;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: params.approved
    ? NOTIFICATION_TYPES.PAYOUT_APPROVED
    : NOTIFICATION_TYPES.PAYOUT_REJECTED,
  title: params.approved
    ? 'Yêu cầu rút tiền đã được duyệt'
    : 'Yêu cầu rút tiền bị từ chối',
  content: params.approved
    ? `Yêu cầu rút tiền của bạn cho giải ${params.tournamentName} đã được quản trị viên phê duyệt.`
    : `Yêu cầu rút tiền của bạn cho giải ${params.tournamentName} đã bị từ chối. Vui lòng kiểm tra lại chi tiết.`,
  redirectUrl: '/organizer/payouts',
});

export const buildMatchCompletedNotification = (params: {
  tournamentId: string;
  tournamentName: string;
  receiverId: string;
  divisionId?: string;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.MATCH_COMPLETED,
  title: 'Trận đấu đã hoàn thành',
  content: `Trận đấu của bạn tại giải ${params.tournamentName} đã có kết quả. Xem ngay!`,
  redirectUrl: getTournamentRedirect(params.tournamentId, {
    tab: 'bracket',
    divisionId: params.divisionId,
  }),
});

export const buildMatchScheduledNotification = (params: {
  tournamentId: string;
  tournamentName: string;
  receiverId: string;
  court: string;
  scheduledTime: string;
  divisionId?: string;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.MATCH_SCHEDULED,
  title: 'Cập nhật lịch thi đấu mới',
  content: `Trận đấu của bạn tại giải ${params.tournamentName} đã được xếp lịch vào lúc ${params.scheduledTime} tại sân ${params.court}. Vui lòng kiểm tra và có mặt đúng giờ.`,
  redirectUrl: getTournamentRedirect(params.tournamentId, {
    tab: 'bracket',
    divisionId: params.divisionId,
  }),
});

export const buildRefereeAssignedNotification = (params: {
  tournamentId: string;
  receiverId: string;
  matchName: string;
  scheduledTime: string;
  divisionId?: string;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.REFEREE_ASSIGNED,
  title: 'Phân công trọng tài bắt chính',
  content: `Bạn đã được phân công bắt chính trận đấu ${params.matchName} vào lúc ${params.scheduledTime}.`,
  redirectUrl: getTournamentRedirect(params.tournamentId, {
    tab: 'matches',
    divisionId: params.divisionId,
  }),
});

export const buildStaffAddedNotification = (params: {
  tournamentId: string;
  tournamentName: string;
  receiverId: string;
  roleLabel: string;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.STAFF_ADDED,
  title: 'Bạn được thêm vào ban tổ chức của giải đấu',
  content: `Bạn đã được thêm vào giải ${params.tournamentName} với vai trò ${params.roleLabel}. Giải đấu hiện nằm trong danh sách quản lý của bạn.`,
  redirectUrl: getOrganizerTournamentRedirect(params.tournamentId, {
    tab: 'overview',
  }),
});

export const buildRefereeInviteNotification = (params: {
  tournamentId: string;
  tournamentName: string;
  receiverId: string;
  refereeId: string;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.REFEREE_INVITED,
  title: 'Bạn có lời mời làm trọng tài',
  content: `Ban tổ chức vừa mời bạn tham gia điều hành giải ${params.tournamentName} với vai trò trọng tài.`,
  redirectUrl: buildRedirectPath('/notifications', {
    action: 'referee-invite',
    tournamentId: params.tournamentId,
    refereeId: params.refereeId,
  }),
});

export const buildRefereeInviteAcceptedNotification = (params: {
  tournamentId: string;
  tournamentName: string;
  receiverId: string;
  refereeName: string;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.REFEREE_INVITE_ACCEPTED,
  title: 'Trọng tài đã nhận lời mời',
  content: `${params.refereeName} đã đồng ý tham gia điều hành giải ${params.tournamentName}.`,
  redirectUrl: getOrganizerTournamentRedirect(params.tournamentId, {
    tab: 'permissions',
  }),
});

export const buildRefereeInviteRevokedNotification = (params: {
  tournamentId: string;
  tournamentName: string;
  receiverId: string;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.REFEREE_INVITE_REVOKED,
  title: 'Lời mời trọng tài đã bị thu hồi',
  content: `Ban tổ chức đã thu hồi lời mời trọng tài của bạn tại giải ${params.tournamentName}.`,
  redirectUrl: getTournamentRedirect(params.tournamentId, {
    tab: 'overview',
  }),
});

export const buildRefereeInviteDeclinedNotification = (params: {
  tournamentId: string;
  tournamentName: string;
  receiverId: string;
  refereeName: string;
}): CreateNotificationDto => ({
  receiverId: params.receiverId,
  type: NOTIFICATION_TYPES.REFEREE_INVITE_DECLINED,
  title: 'Trọng tài đã từ chối lời mời',
  content: `${params.refereeName} đã từ chối vai trò trọng tài tại giải ${params.tournamentName}.`,
  redirectUrl: getOrganizerTournamentRedirect(params.tournamentId, {
    tab: 'permissions',
  }),
});
