export interface SportRules {
  setsToWin: number;
  pointsPerSet: number;
  mustWinByTwo: boolean;
  maxPointsPerSet: number;
  tiebreakPoints?: number;
  serveSwitchEvery?: number;
  switchSidesBetweenSets?: boolean;
  winPoints?: number;
  drawPoints?: number;
  lossPoints?: number;
}

export interface TournamentConfig {
  bracketType: 'SINGLE_ELIMINATION' | 'DOUBLE_ELIMINATION' | 'ROUND_ROBIN' | 'GROUP_STAGE_KNOCKOUT';
  maxTeams: number;
  seedingMethod: 'RANDOM' | 'MANUAL' | 'ELO_BASED';
  thirdPlaceMatch: boolean;
  roundRobinLegs?: number;
  numberOfGroups?: number;
  teamsAdvancingPerGroup?: number;
  knockoutBracketType?: 'SINGLE_ELIMINATION' | 'DOUBLE_ELIMINATION';
  minElo?: number | null;
  maxElo?: number | null;
  maxCombinedElo?: number | null;
  maxTeammateGap?: number | null;
  registrationMode?: 'OPEN' | 'APPROVAL' | 'INVITE_ONLY';
}

export interface Prize {
  rank: number;
  title: string;
  reward: string;
  imageUrl?: string;
  prizeAmount?: number;
}

export interface ContactInfo {
  phone?: string;
  zalo?: string;
  facebook?: string;
  email?: string;
  note?: string;
}

export type TournamentType = 'CLUB' | 'PUBLIC';
export type MatchType = 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES';
export type TournamentStatus = 'DRAFT' | 'UPCOMING' | 'REGISTRATION_OPEN' | 'REGISTRATION_CLOSED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type CategoryRuleKind =
  | 'BADMINTON'
  | 'TABLE_TENNIS'
  | 'PICKLEBALL_RALLY'
  | 'PICKLEBALL_SIDE_OUT'
  | 'TENNIS';

export interface CategoryConfig {
  ruleKind?: CategoryRuleKind;
  allowedRuleKinds?: CategoryRuleKind[];
  defaultSportRules?: SportRules;
  supportedMatchTypes?: ('SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES')[];
  description?: string;
  iconUrl?: string;
}

export interface RosterMember {
  userId: string;
  fullName: string | null;
  avatarUrl: string | null;
  role: string;
  isMock?: boolean;
  elo: {
    eloPoints: number;
    tierName: string;
  };
}

export type BracketMatch = typeof schema.matches.$inferSelect & {
  participant1?: { id: string; teamName: string; seed: number | null } | null;
  participant2?: { id: string; teamName: string; seed: number | null } | null;
};

export interface BracketGroup {
  id: string;
  name: string;
  roundConfig: Record<string, unknown> | null;
  matches: BracketMatch[];
}

export interface BracketStage {
  id: string;
  name: string;
  type: string;
  order: number;
  roundConfig: Record<string, unknown> | null;
  matchSettings: Record<string, unknown> | null;
  groups: BracketGroup[];
}

import * as schema from '../../../database/schema';
