"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_ACTIVE_FOOTBALL_TEAMS = void 0;
exports.assertCanCreateActiveFootballTeam = assertCanCreateActiveFootballTeam;
exports.assertCanJoinActiveFootballTeam = assertCanJoinActiveFootballTeam;
const common_1 = require("@nestjs/common");
exports.MAX_ACTIVE_FOOTBALL_TEAMS = 3;
function assertCanCreateActiveFootballTeam(activeCreatedCount) {
    if (activeCreatedCount >= exports.MAX_ACTIVE_FOOTBALL_TEAMS) {
        throw new common_1.ConflictException('Bạn đã tạo tối đa 3 đội bóng đang hoạt động.');
    }
}
function assertCanJoinActiveFootballTeam(activeMembershipCount) {
    if (activeMembershipCount >= exports.MAX_ACTIVE_FOOTBALL_TEAMS) {
        throw new common_1.ConflictException('Bạn đã tham gia tối đa 3 đội đang hoạt động.');
    }
}
//# sourceMappingURL=football-team-limits.js.map