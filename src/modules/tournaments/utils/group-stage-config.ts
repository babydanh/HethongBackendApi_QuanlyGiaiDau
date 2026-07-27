/**
 * Derive GROUP_STAGE_KNOCKOUT config from actual eligible (COMPLETE+paid) team count.
 * Pure function — no DB or side effects.
 */
export function deriveGroupStageConfig(actualTeams: number): {
  numGroups: number;
  teamsAdvancing: number;
  teamsPerGroup: number;
} {
  if (actualTeams < 4) {
    throw new Error('Cần ít nhất 4 đội để tạo vòng bảng + loại trực tiếp.');
  }

  let numGroups: number;
  let teamsAdvancing: number;

  if (actualTeams <= 5) {
    numGroups = 2;
    teamsAdvancing = 1;
  } else if (actualTeams <= 11) {
    numGroups = 2;
    teamsAdvancing = 2;
  } else if (actualTeams <= 15) {
    numGroups = 4;
    teamsAdvancing = 1;
  } else if (actualTeams <= 23) {
    numGroups = 4;
    teamsAdvancing = 2;
  } else {
    // 24-32
    numGroups = 8;
    const minGroupSize = Math.floor(actualTeams / numGroups);
    teamsAdvancing = minGroupSize >= 3 ? 2 : 1;
  }

  const teamsPerGroup = Math.ceil(actualTeams / numGroups);

  return { numGroups, teamsAdvancing, teamsPerGroup };
}
