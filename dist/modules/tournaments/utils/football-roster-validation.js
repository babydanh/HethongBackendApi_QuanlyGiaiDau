"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateFootballRosterSelection = validateFootballRosterSelection;
const common_1 = require("@nestjs/common");
function validateFootballRosterSelection(input) {
    const mainMemberIds = [...new Set([input.leaderId, ...input.memberIds])];
    const reserveMemberIds = [...new Set(input.reserveMemberIds)];
    if (reserveMemberIds.includes(input.leaderId)) {
        throw new common_1.BadRequestException('Đội trưởng phải nằm trong đội hình chính của đăng ký.');
    }
    if (mainMemberIds.some((memberId) => reserveMemberIds.includes(memberId))) {
        throw new common_1.BadRequestException('Một thành viên không thể vừa là cầu thủ chính vừa là dự bị.');
    }
    if (mainMemberIds.some((memberId) => !input.activeMemberIds.has(memberId))) {
        throw new common_1.BadRequestException('Đội hình đăng ký chỉ được chọn thành viên đang hoạt động của đội bóng.');
    }
    if (reserveMemberIds.some((memberId) => !input.activeMemberIds.has(memberId))) {
        throw new common_1.BadRequestException('Danh sách dự bị chỉ được chọn thành viên đang hoạt động của đội bóng.');
    }
    if (input.minMainSize > 0 && mainMemberIds.length < input.minMainSize) {
        throw new common_1.BadRequestException(`Đội hình chính phải có ít nhất ${input.minMainSize} cầu thủ.`);
    }
    if (input.maxMainSize > 0 && mainMemberIds.length > input.maxMainSize) {
        throw new common_1.BadRequestException(`Đội hình chính không được vượt quá ${input.maxMainSize} cầu thủ; hãy chuyển người dư sang danh sách dự bị.`);
    }
    if (reserveMemberIds.length > input.maxReserve || mainMemberIds.length + reserveMemberIds.length > input.maxTotalSize) {
        throw new common_1.BadRequestException(`Đội hình chỉ được có tối đa ${input.maxReserve} dự bị và ${input.maxTotalSize} thành viên tổng cộng.`);
    }
    return {
        mainMemberIds,
        reserveMemberIds,
        allMemberIds: [...mainMemberIds, ...reserveMemberIds],
    };
}
//# sourceMappingURL=football-roster-validation.js.map