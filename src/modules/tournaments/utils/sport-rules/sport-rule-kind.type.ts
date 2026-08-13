export const SPORT_RULE_KINDS = [
  'BADMINTON',
  'TABLE_TENNIS',
  'PICKLEBALL_RALLY',
  'PICKLEBALL_SIDE_OUT',
  'TENNIS',
  'FOOTBALL',
] as const;

export type SportRuleKind = (typeof SPORT_RULE_KINDS)[number];

export type SportScoringModel = 'RALLY_POINT_SET' | 'TENNIS_SET' | 'PICKLEBALL_SIDE_OUT';
