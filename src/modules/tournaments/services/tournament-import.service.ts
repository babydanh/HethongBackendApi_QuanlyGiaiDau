import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { TournamentsRepository } from '../tournaments.repository';
import { TournamentAccessService } from './tournament-access.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { MailService } from '../../../providers/mail/mail.service';
import {
  buildParticipantRegistrationPendingNotification,
  buildParticipantRegistrationSuccessNotification,
} from '../../notifications/notification-builder';
import { ImportParticipantsDto } from '../dto/import-participants.dto';

@Injectable()
export class TournamentImportService {
  constructor(
    private readonly tournamentsRepository: TournamentsRepository,
    private readonly tournamentAccessService: TournamentAccessService,
    private readonly notificationsService: NotificationsService,
    @Optional() private readonly mailService?: MailService,
  ) {}
  async importParticipantsFromForm(
    tournamentId: string,
    userId: string,
    systemRoles: string[],
    dto: ImportParticipantsDto,
    broadcastRegistrationChanged: (
      tournamentId: string,
      payload: { divisionId?: string | null; action: string },
    ) => void,
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    const isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền nhập danh sách VĐV');
    }

    if (tournament.status === 'COMPLETED') {
      throw new BadRequestException('Giải đấu đã kết thúc');
    }
    if (
      tournament.status === 'REGISTRATION_CLOSED' ||
      tournament.isRegistrationLocked
    ) {
      throw new BadRequestException(
        'Đăng ký đã được khóa. Không thể nhập thêm VĐV hoặc gửi lời mời mới.',
      );
    }

    const result = await this.tournamentsRepository.importParticipants(
      tournamentId,
      userId,
      dto.participants,
      dto.divisionId,
    );

    if (dto.notifyLinkedAccounts && result.linkedAccountNotifications?.length) {
      for (const recipient of result.linkedAccountNotifications) {
        try {
          const notification =
            recipient.status === 'COMPLETE'
              ? buildParticipantRegistrationSuccessNotification({
                  tournamentId,
                  tournamentName: tournament.name,
                  receiverId: recipient.userId,
                  divisionId: recipient.divisionId,
                })
              : buildParticipantRegistrationPendingNotification({
                  tournamentId,
                  tournamentName: tournament.name,
                  receiverId: recipient.userId,
                  divisionId: recipient.divisionId,
                });
          await this.notificationsService.sendNotification(notification);
        } catch {
          // A notification failure must not roll back a successful import.
        }
      }
    }

    // Unmatched contacts are intentionally not invited or notified by clone/import.
    // Keep this legacy opt-in email branch only for explicit non-clone callers.
    if (
      dto.sendInvitationEmail &&
      this.mailService &&
      result.unregisteredEmails?.length
    ) {
      for (const recipient of result.unregisteredEmails) {
        try {
          const html = `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff;">
              <div style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #ffffff; padding: 28px 24px; text-align: center;">
                <h1 style="margin: 0; font-size: 22px; font-weight: bold; letter-spacing: 0.5px;">SPORTO - THƯ MỜI THI ĐẤU</h1>
              </div>
              <div style="padding: 28px 24px;">
                <p style="font-size: 15px; margin-top: 0;">Xin chào <strong>${recipient.name || 'VĐV'}</strong>,</p>
                <p style="font-size: 14px; color: #475569;">
                  Ban tổ chức đã ghi danh bạn tham gia giải đấu <strong>${tournament.name}</strong> (Tên đội / Cặp: <strong>${recipient.teamName}</strong>).
                </p>
                <p style="font-size: 14px; color: #475569;">
                  Để theo dõi sơ đồ thi đấu, lịch thi đấu theo thời gian thực và nhận thông báo khi trọng tài xếp sân, bạn vui lòng kích hoạt tài khoản Sporto bằng cách bấm vào nút bên dưới:
                </p>
                <div style="text-align: center; margin: 32px 0;">
                  <a href="https://sporto.asia/auth/register?email=${encodeURIComponent(recipient.email)}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">
                    Kích hoạt tài khoản & Xem giải đấu
                  </a>
                </div>
                <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; margin-top: 24px;">
                  <p style="font-size: 12px; color: #94a3b8; margin: 0;">
                    Thư này được gửi tự động từ hệ thống quản lý giải đấu Sporto theo ủy quyền của Ban tổ chức.
                  </p>
                </div>
              </div>
            </div>
          `;
          await this.mailService.sendMail(
            recipient.email,
            `[Sporto] Thư mời tham gia giải đấu: ${tournament.name}`,
            html,
          );
        } catch {
          // Continue processing next email
        }
      }
    }

    broadcastRegistrationChanged(tournamentId, {
      divisionId: dto.divisionId,
      action: 'IMPORT_PARTICIPANTS',
    });

    return {
      message: `Đã nạp thành công ${result.importedCount} VĐV / Đội vào giải đấu!`,
      importedCount: result.importedCount,
      emailsSent: dto.sendInvitationEmail
        ? (result.unregisteredEmails?.length ?? 0)
        : 0,
    };
  }
}
