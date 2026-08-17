"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertFootballRosterLockable = assertFootballRosterLockable;
const common_1 = require("@nestjs/common");
function assertFootballRosterLockable(state) {
    if (!state.entryExists) {
        throw new common_1.BadRequestException('Đăng ký đội bóng chưa có roster để khóa.');
    }
    if (state.entryStatus !== 'CONFIRMED' && state.entryStatus !== 'LOCKED') {
        throw new common_1.BadRequestException('Chưa đủ thành viên xác nhận roster để khóa đội.');
    }
    const requiredMainRosterCount = Math.max(1, state.requiredMainRosterCount ?? 1);
    if (state.mainRosterCount < requiredMainRosterCount) {
        throw new common_1.BadRequestException(`Roster đội bóng cần đủ ${requiredMainRosterCount} cầu thủ chính để khóa.`);
    }
    if (state.confirmations.some((status) => status !== 'CONFIRMED')) {
        throw new common_1.BadRequestException('Roster vẫn còn thành viên chưa xác nhận.');
    }
}
//# sourceMappingURL=football-roster-lock.js.map