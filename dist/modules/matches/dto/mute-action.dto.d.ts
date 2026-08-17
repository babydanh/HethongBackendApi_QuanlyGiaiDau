export declare enum MuteType {
    MUTE = "MUTE",
    BAN = "BAN"
}
export declare class MuteActionDto {
    userId: string;
    type: 'MUTE' | 'BAN';
    reason?: string;
}
