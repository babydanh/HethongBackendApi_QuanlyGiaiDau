## Context

Hai lớp chặn quản lý CLB sở hữu giải, cả hai đều phải mở đúng phạm vi:

1. Cổng role: `RolesGuard` (`src/common/guards/roles.guard.ts`) là APP_GUARD toàn cục. Handler có `@Roles(...)` mà JWT không có role nào trong danh sách thì 403 trước khi vào service.
2. Quyền theo giải ở service: mỗi handler đã gọi `TournamentAccessService.isManager(tournament, userId, systemRoles)` (`src/modules/tournaments/services/tournament-access.service.ts:8-44`). Hàm này cho ADMIN, người tạo giải (`createdBy`), đồng BTC (`isCoOrganizer`), người tạo CLB (`findCommunityById().creatorId`), và thành viên OWNER/MODERATOR với status `JOINED`/`ACTIVE` của `tournament.communityId` (`findCommunityMember`). Mọi kiểm tra theo `communityId` của giải đang xét, nên quản lý CLB khác không qua được.

Chốt quyết định:

- **D1 (cổng role):** nới `PLAYER` cho các handler cấp giải mà trang manage thực gọi (34 route, bảng dưới), bằng hằng số `TOURNAMENT_MANAGER_ROLES`. Không nới bằng cách bỏ `@Roles` hay `@Verified()`.
- **D2 (quyền thật ở service):** không thay đổi logic service của 34 route. Mỗi route đã được truy vết: handler → service → dòng `isManager` (hoặc helper gọi `isManager`) trên giải của chính object. Chứng cứ ở bảng.
- **D3 (không nới):** route series, route trang manage không gọi, và route ORGANIZER/ADMIN-only khác giữ nguyên (liệt kê trong proposal).
- **D4 (tầng trận):** `matches.service.ts` `isTournamentManager` dùng `TournamentAccessService.isManager` với `communityId` của giải, thay cho `matchesRepository.isTournamentManager` (chỉ `createdBy` + `CO_ORGANIZER`). Schedule, score, score-access, status, operation, court-state và các route lập lịch giải đều đi qua hàm này. Chốt bởi Main (chọn A).

## Route cấp giải được nới (D1, D2)

Cột "Check" là dòng kiểm quyền trong service ở origin/main `1c4a69a`. Dòng controller là dòng `@Roles(UserRole.ORGANIZER, UserRole.ADMIN)` sẽ đổi thành `@Roles(...TOURNAMENT_MANAGER_ROLES)`.

| # | Route | Controller | Service → Check |
|---|---|---|---|
| 1 | `POST /api/v1/tournaments/:id/divisions` | 293 createDivision | tournament-division.service.ts:35 → :48 |
| 2 | `PATCH /api/v1/tournaments/divisions/:divisionId` | 311 updateDivision | tournament-division.service.ts:185 → :212 |
| 3 | `PATCH /api/v1/tournaments/:id/divisions/:divisionId/config` | 329 updateDivisionConfig | tournament-division.service.ts:313 → :325, :443 |
| 4 | `DELETE /api/v1/tournaments/divisions/:divisionId` | 361 removeDivision → deleteDivision | tournament-division.service.ts:455 → :473 |
| 5 | `PATCH /api/v1/tournaments/:id` | 943 update | tournament-lifecycle.service.ts:532 → :613 |
| 6 | `DELETE /api/v1/tournaments/:id/bracket/divisions/:divisionId` | 1017 cancelDivisionBracket | tournament-bracket.service.ts:637 → :646 |
| 7 | `POST /api/v1/tournaments/:id/publish` | 1035 publish | tournament-lifecycle.service.ts:1369 → :1373 |
| 8 | `PATCH /api/v1/tournaments/:id/seeds` | 1080 updateSeeds | tournament-bracket.service.ts:770 → :779 |
| 9 | `POST /api/v1/tournaments/:id/lock` | 1098 lock | tournament-lifecycle.service.ts:1547 → :1556 |
| 10 | `POST /api/v1/tournaments/:id/regenerate-invite` | 1224 regenerateInvite | tournament-registration.service.ts:1106 → :1117 |
| 11 | `POST /api/v1/tournaments/:id/reopen-registration` | 1240 reopenRegistration | tournament-registration.service.ts:1002 → :1017 |
| 12 | `POST /api/v1/tournaments/:id/gallery` | 1275 addGalleryImage | tournament-media.service.ts:177 → :193 |
| 13 | `DELETE /api/v1/tournaments/:id/gallery/:index` | 1293 removeGalleryImage | tournament-media.service.ts:205 → :221 |
| 14 | `POST /api/v1/tournaments/:id/referees` | 1353 addReferee | tournament-referee.service.ts:40 → :51 |
| 15 | `DELETE /api/v1/tournaments/:id/referees/:refereeId` | 1391 revokeRefereeInvite | tournament-referee.service.ts:164 → :182 |
| 16 | `PATCH /api/v1/tournaments/stages/:id` | 1420 updateStage | tournament-bracket.service.ts:67 → :82 |
| 17 | `POST /api/v1/tournaments/:id/roster-import-batches/preview` | 1534 previewRosterImportBatch | tournament-participant-admin.service.ts:93 → :99 |
| 18 | `POST /api/v1/tournaments/:id/roster-import-batches` | 1552 importRosterBatch → importRosterBatchFromForm | tournament-import.service.ts:141 → :149 (assertImportable → assertTournamentManager → :401) |
| 19 | `GET /api/v1/tournaments/:id/add-athletes/candidates` | 1595 listAddAthleteCandidates | tournament-import.service.ts:193 → :200, :201 |
| 20 | `POST /api/v1/tournaments/:id/add-athletes/search` | 1613 searchAddAthleteCandidates | tournament-import.service.ts:227 → :240, :241 |
| 21 | `POST /api/v1/tournaments/:id/add-athletes/candidates` | 1633 addAthleteCandidate | tournament-import.service.ts:269 → :277, :278 |
| 22 | `POST /api/v1/tournaments/:id/add-athletes/direct` | 1651 addDirectAthlete | tournament-import.service.ts:324 → :331, :356 (assertImportable → :401) |
| 23 | `POST /api/v1/tournaments/:id/add-athletes/pairs` | 1669 addAthletePairs | tournament-import.service.ts:349 → :356 |
| 24 | `PATCH /api/v1/tournaments/:id/participants/:participantId` | 1721 updateParticipantStatus | tournament-participant-admin.service.ts:264 → :279 |
| 25 | `PATCH /api/v1/tournaments/:id/participants/:participantId/fee-payment` | 1741 setParticipantFeePaid | tournament-participant-admin.service.ts:458 → :469 |
| 26 | `PATCH /api/v1/tournaments/:id/participants/:participantId/note` | 1763 setParticipantNote | tournament-participant-admin.service.ts:596 → :606 |
| 27 | `PATCH /api/v1/tournaments/:id/participants/:participantId/presence` | 1785 setParticipantPresent | tournament-participant-admin.service.ts:646 → :664 |
| 28 | `POST /api/v1/tournaments/:id/participants/:participantId/lock-roster` | 1830 lockParticipantRoster | tournament-football-roster.service.ts:57 → :74 |
| 29 | `POST /api/v1/tournaments/:id/participants/:participantId/unlock-roster` | 1848 unlockParticipantRoster | tournament-football-roster.service.ts:96 → :109 |
| 30 | `POST /api/v1/tournaments/:id/reserve-slots` | 1922 assignReservedSlot | tournament-football-roster.service.ts:336 → :348 |
| 31 | `POST /api/v1/tournaments/:id/auto-seed` | 2079 autoSeed → autoSeedFromElo | tournament-bracket.service.ts:692 → :701 |
| 32 | `POST /api/v1/tournaments/:id/advance-standings` | 2097 advanceStandings | tournament-bracket.service.ts:264 → :274 |
| 33 | `POST /api/v1/tournaments/:id/staff` | 2150 addStaffMember | tournament-staff.service.ts:24 → :33 |
| 34 | `DELETE /api/v1/tournaments/:id/staff/:userId` | 2169 removeStaffMember | tournament-staff.service.ts:74 → :82 |

Ghi chú: các route 1 và 2 dùng `:divisionId`, service tìm giải qua `findDivisionById → division.tournamentId` rồi `isManager` (`tournament-division.service.ts:200-216`), nên quyền vẫn theo giải chứa bảng đó.

## Trận đấu (D4)

Trang manage gọi `PATCH /api/v1/matches/:id/schedule` (5 lần) và `GET /api/v1/matches/:id/score-access`. Trang ops gọi `PATCH /api/v1/matches/:id/score`, `/status`, `/operation`, `/court-state`. Các route này đã có `PLAYER` trong `@Roles`, nên chặn xảy ra ở service:

- `matches.service.ts:164-176` `isTournamentManager(match, user)`: hiện `isAdmin || match.tournament.createdBy === user.sub || matchesRepository.isTournamentManager(...)`. Đổi thành `isAdmin || tournamentAccessService.isManager({id, createdBy, communityId} của match.tournament, user.sub, roles)`.
- Caller hiện tại của wrapper: `:192` (getTournamentMatchScoreAccess), `:1947`, `:2188`, `:2457` (updateSchedule), `:2645`. Tất cả nhận quyền mới.
- `getTournamentMatchScoreAccess` (`:177-220`): `canScore = isTournamentManager || isReferee || acceptedReferee || canScoreSuperLite`. Không đổi các nhánh khác.
- Lập lịch giải: `getAiSchedulePlannerContext` (`:896`, kiểm tra `:906-914`) và `previewSchedulePlan` (`:951`, kiểm tra `:960-968`) hiện dùng `tournament.createdBy` + `matchesRepository.isTournamentManager(tournamentId, ...)`. Đổi thành `isManager` với `communityId` lấy từ `findScheduleTournament`, thêm `communityId` vào select của `findScheduleTournament` (`matches.repository.ts:2856`).
- `MatchesService` nhận thêm tham số `tournamentAccessService: TournamentAccessService` (bắt buộc, không `@Optional`, để không fail-open). `MatchesModule` import `forwardRef(() => TournamentsModule)`; `TournamentsModule` export `TournamentAccessService`.
- Xoá `MatchesRepository.isTournamentManager` (`matches.repository.ts:2826-2854`), không còn caller.

## Route không nới (D3)

- Series: `createParent` (211), `updateParent` (252), `removeParent` (270). `parent` không có `communityId`, không thể có quyền CLB.
- Trang manage không gọi, giữ ORGANIZER/ADMIN: `createPlayoffMatch` (2041), `finalizeStage` (2061), `updateGroup` (1438), `cancelTournament` (1987), `confirmRoster` (1114), `previewRosterImport` (1498), `importParticipants` (1516), `importRoster` (1577).
- Trận không thuộc trang manage/ops: `assign-referee`, `overlay-visibility`, `scoreboard-visibility`, `mute/ban` (`matches.controller.ts:283,303,315`; overlay/scoreboard của matches sẽ được xem lại ở change khác nếu cần).

## Rủi ro đã biết

- `checkLiteAuthorization` (`tournament-lite.service.ts` ~1420-1475) cho quyền theo OWNER/MODERATOR mà không kiểm status `JOINED`/`ACTIVE`, lỏng hơn `isManager`. Không thay đổi trong change này; ghi nhận.
- Test service-level dùng mock repository. Không có e2e Postgres trong change này (`pnpm test:e2e` cần Docker, chưa chạy).
