import { type SportRuleKind } from './sport-rule-kind.type';
interface CategoryRuleSource {
    categoryConfig?: Record<string, unknown> | null;
    categoryName?: string | null;
    categorySlug?: string | null;
}
interface ValidateSportRuleConfigOptions {
    expectedKind?: SportRuleKind | null;
    allowedKinds?: SportRuleKind[] | null;
    sourceLabel: string;
    allowRoundStructure?: boolean;
    allowRoundMetadata?: boolean;
}
export declare function validateSportRuleConfig(payload: Record<string, unknown> | null | undefined, options: ValidateSportRuleConfigOptions): void;
export declare function inferExpectedSportRuleKind(source: CategoryRuleSource): SportRuleKind;
export declare function inferAllowedSportRuleKinds(source: CategoryRuleSource): SportRuleKind[];
export {};
