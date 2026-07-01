import { BadRequestException } from '@nestjs/common';
import type { NormalizedScoreEntry } from './score-validation.types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScoreKey(key: string): boolean {
  return /^(set|game)\d+$/i.test(key);
}

export function extractNormalizedScoreEntries(scoreDetails: Record<string, unknown>): NormalizedScoreEntry[] {
  const setsValue = scoreDetails.sets;
  if (Array.isArray(setsValue)) {
    return setsValue.map((setValue, index) => {
      if (!isRecord(setValue)) {
        throw new BadRequestException(`Set ${index + 1}: Dữ liệu phải là object chứa team1Score và team2Score.`);
      }

      const team1Score = Number(setValue.team1Score);
      const team2Score = Number(setValue.team2Score);
      if (!Number.isInteger(team1Score) || !Number.isInteger(team2Score) || team1Score < 0 || team2Score < 0) {
        throw new BadRequestException(`Set ${index + 1}: Điểm số phải là số nguyên không âm.`);
      }

      return {
        key: `set${index + 1}`,
        p1: team1Score,
        p2: team2Score,
        scoreStr: `${team1Score}-${team2Score}`,
        isFinished: setValue.isFinished === true,
      };
    });
  }

  const scoreKeys = Object.keys(scoreDetails)
    .filter((key) => isScoreKey(key) && typeof scoreDetails[key] === 'string')
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));

  return scoreKeys.map((key) => {
    const scoreStr = scoreDetails[key];
    if (typeof scoreStr !== 'string') {
      throw new BadRequestException(`Tỉ số set cho key '${key}' phải là chuỗi 'p1-p2'.`);
    }

    const parts = scoreStr.split('-');
    if (parts.length !== 2) {
      throw new BadRequestException(`Tỉ số set '${scoreStr}' không đúng định dạng 'p1-p2'.`);
    }

    const p1 = Number.parseInt(parts[0], 10);
    const p2 = Number.parseInt(parts[1], 10);
    if (!Number.isInteger(p1) || !Number.isInteger(p2) || p1 < 0 || p2 < 0) {
      throw new BadRequestException(`Điểm số set '${scoreStr}' phải là số nguyên không âm.`);
    }

    return { key, p1, p2, scoreStr, isFinished: true };
  });
}

export function validatePickleballSideOutState(scoreDetails: Record<string, unknown>) {
  const sideOutState = scoreDetails.sideOutState;
  if (sideOutState === undefined) {
    return;
  }

  if (!isRecord(sideOutState)) {
    throw new BadRequestException('sideOutState phải là object hợp lệ cho pickleball side-out.');
  }

  const servingTeam = sideOutState.servingTeam;
  const serverNumber = sideOutState.serverNumber;
  const openingSequenceDone = sideOutState.openingSequenceDone;

  if (servingTeam !== null && servingTeam !== 1 && servingTeam !== 2) {
    throw new BadRequestException('sideOutState.servingTeam chỉ được là 1, 2 hoặc null.');
  }

  if (serverNumber !== 1 && serverNumber !== 2) {
    throw new BadRequestException('sideOutState.serverNumber chỉ được là 1 hoặc 2.');
  }

  if (typeof openingSequenceDone !== 'boolean') {
    throw new BadRequestException('sideOutState.openingSequenceDone phải là boolean.');
  }
}
