import { CreateTournamentDto } from './create-tournament.dto';
declare const UpdateTournamentDto_base: import("@nestjs/common").Type<Partial<CreateTournamentDto>>;
export declare class UpdateTournamentDto extends UpdateTournamentDto_base {
    isRegistrationLocked?: boolean;
    status?: string;
    inviteCode?: string;
}
export {};
