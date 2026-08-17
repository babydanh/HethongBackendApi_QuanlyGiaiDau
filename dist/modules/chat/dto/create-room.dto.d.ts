export declare enum RoomType {
    DIRECT = "DIRECT",
    GROUP = "GROUP",
    SUPPORT = "SUPPORT",
    CLUB = "CLUB"
}
export declare class CreateRoomDto {
    name?: string;
    type: RoomType;
    memberIds: string[];
}
