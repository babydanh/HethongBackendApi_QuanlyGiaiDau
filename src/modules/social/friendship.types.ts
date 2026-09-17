export type FriendshipStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'BLOCKED';

export type FriendshipDirection = 'INCOMING' | 'OUTGOING' | 'NONE';

export interface FriendshipStatusView {
  id: string | null;
  status: FriendshipStatus | 'NONE';
  direction: FriendshipDirection;
  senderId: string | null;
  receiverId: string | null;
}
