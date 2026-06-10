export interface ChatMessagePayload {
  senderId?: string | null;
  senderName?: string;
  content?: string | null;
  timestamp?: string;
  [key: string]: unknown;
}
