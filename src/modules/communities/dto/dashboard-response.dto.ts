import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DashboardPlayerDto {
  @ApiProperty({ description: 'ID người chơi (user đầu tiên của đội)' })
  id: string;

  @ApiProperty({ description: 'Tên hiển thị (nhiều người cách nhau bởi " & ")', example: 'Nguyễn Văn A & Trần Thị B' })
  fullName: string;

  @ApiPropertyOptional({ nullable: true, description: 'Avatar người chơi đầu tiên' })
  avatarUrl: string | null;
}

export class RecentMatchDto {
  @ApiProperty({ description: 'ID trận đấu' })
  id: string;

  @ApiProperty({ type: DashboardPlayerDto, nullable: true })
  playerA: DashboardPlayerDto | null;

  @ApiProperty({ type: DashboardPlayerDto, nullable: true })
  playerB: DashboardPlayerDto | null;

  @ApiProperty({ description: 'Số set thắng bên A' })
  scoreA: number;

  @ApiProperty({ description: 'Số set thắng bên B' })
  scoreB: number;

  @ApiProperty({ description: 'Trạng thái trận đấu', example: 'COMPLETED' })
  status: string;

  @ApiProperty({ description: 'ELO thay đổi của người thắng (âm = thua)', example: 14 })
  eloDelta: number;

  @ApiPropertyOptional({ nullable: true, description: 'Thời điểm kết thúc trận' })
  playedAt: Date | null;
}

export class FeaturedTournamentDto {
  @ApiProperty({ description: 'ID giải đấu' })
  id: string;

  @ApiProperty({ description: 'Tên giải đấu', example: 'Summer Cup 2026' })
  name: string;

  @ApiProperty({ description: 'Trạng thái giải đấu', example: 'ONGOING' })
  status: string;

  @ApiProperty({ description: 'Số VĐV tham gia', example: 32 })
  participantCount: number;

  @ApiPropertyOptional({ nullable: true, description: 'Tên nhà vô địch (null nếu chưa xác định)' })
  championName: string | null;
}

export class TopPlayerDto {
  @ApiProperty({ description: 'ID người chơi' })
  userId: string;

  @ApiProperty({ description: 'Tên người chơi' })
  fullName: string;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl: string | null;

  @ApiProperty({ description: 'ELO hiện tại', example: 1682 })
  elo: number;

  @ApiPropertyOptional({ nullable: true, description: 'Tên tier (từ elo_tiers)', example: 'S' })
  tierName: string | null;

  @ApiProperty({ description: 'Thứ hạng (1-based)', example: 1 })
  rank: number;

  @ApiProperty({ description: 'Chuỗi thắng hiện tại', example: 5 })
  winStreak: number;
}

export class ActivityItemDto {
  @ApiProperty({ enum: ['MEMBER_JOINED', 'GALLERY_ADDED', 'TOURNAMENT_CREATED'] })
  type: 'MEMBER_JOINED' | 'GALLERY_ADDED' | 'TOURNAMENT_CREATED';

  @ApiPropertyOptional({ nullable: true, description: 'ID người tạo hoạt động' })
  userId: string | null;

  @ApiProperty({ description: 'Tên người tạo hoạt động' })
  userName: string;

  @ApiProperty({ description: 'Mô tả ngắn', example: 'gia nhập CLB' })
  message: string;

  @ApiProperty({ description: 'Thời điểm hoạt động' })
  at: Date;
}

export class UpcomingMatchDto {
  @ApiProperty({ description: 'ID trận đấu' })
  id: string;

  @ApiProperty({ type: DashboardPlayerDto, nullable: true })
  playerA: DashboardPlayerDto | null;

  @ApiProperty({ type: DashboardPlayerDto, nullable: true })
  playerB: DashboardPlayerDto | null;

  @ApiPropertyOptional({ nullable: true, description: 'Thời điểm dự kiến thi đấu' })
  scheduledAt: Date | null;
}

export class DashboardResponseDto {
  @ApiProperty({ type: [RecentMatchDto], description: 'Trận gần nhất (max 3)' })
  recentMatches: RecentMatchDto[];

  @ApiProperty({ type: FeaturedTournamentDto, nullable: true, description: 'Giải nổi bật (null nếu chưa có)' })
  featuredTournament: FeaturedTournamentDto | null;

  @ApiProperty({ type: [TopPlayerDto], description: 'Top 3 theo ELO' })
  topPlayers: TopPlayerDto[];

  @ApiProperty({ type: [ActivityItemDto], description: 'Hoạt động gần đây (max 5)' })
  activity: ActivityItemDto[];

  @ApiProperty({ type: [UpcomingMatchDto], description: 'Trận sắp diễn ra (max 3)' })
  upcomingMatches: UpcomingMatchDto[];
}
