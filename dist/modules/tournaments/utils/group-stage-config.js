"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveGroupStageConfig = deriveGroupStageConfig;
function deriveGroupStageConfig(actualTeams) {
    if (actualTeams < 4) {
        throw new Error('Cần ít nhất 4 đội để tạo vòng bảng + loại trực tiếp.');
    }
    let numGroups;
    let teamsAdvancing;
    if (actualTeams <= 5) {
        numGroups = 2;
        teamsAdvancing = 1;
    }
    else if (actualTeams <= 11) {
        numGroups = 2;
        teamsAdvancing = 2;
    }
    else if (actualTeams <= 15) {
        numGroups = 4;
        teamsAdvancing = 1;
    }
    else if (actualTeams <= 23) {
        numGroups = 4;
        teamsAdvancing = 2;
    }
    else {
        numGroups = 8;
        const minGroupSize = Math.floor(actualTeams / numGroups);
        teamsAdvancing = minGroupSize >= 3 ? 2 : 1;
    }
    const teamsPerGroup = Math.ceil(actualTeams / numGroups);
    return { numGroups, teamsAdvancing, teamsPerGroup };
}
//# sourceMappingURL=group-stage-config.js.map