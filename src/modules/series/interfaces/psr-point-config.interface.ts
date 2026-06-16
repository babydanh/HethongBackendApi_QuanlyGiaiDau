export interface PsrPointConfig {
  pointsByRank: Record<number, number>;
  directEntryThreshold: number;
  wildcardCount: number;
  exclusionRule: boolean;
  exclusionScope: 'CATEGORY' | 'ALL';
  description: string;
  minStagesRequired?: number;
}
