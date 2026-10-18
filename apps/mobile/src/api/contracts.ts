// Public projections of the existing backend contracts. Internal IDs are deliberately absent.
export type Vibe = "DEEP_TALK" | "CHAOS" | "RANT_ZONE" | "GAMER_LOBBY";
export type Role = "OWNER" | "MEMBER";
export type Ghost = { ghostName: string; ghostAvatar: string; role: Role };
export type Room = {
  code: string;
  name: string | null;
  vibe: Vibe;
  createdAt: string;
  expiresAt: string;
  activeMemberCount: number;
  maxCapacity: number;
};
export type Member = Ghost & { joinedAt: string };
export type Membership = Ghost & {
  status: "ACTIVE";
  joinedAt: string;
  leftAt: null;
};
export type RoomDetails = { room: Room; membership: Ghost };
export type Members = { members: Member[]; total: number; maxCapacity: number };
export type Message = {
  messageId: string;
  code: string;
  text: string;
  createdAt: string;
  author: { participantId: string; ghostName: string; ghostAvatar: string };
};
export type History = { messages: Message[]; nextCursor: string | null };
export type Participant = Ghost & { participantId: string };
export type Subscription = {
  code: string;
  subscribed: boolean;
  participant: Participant;
};
export type SendResult = {
  clientMessageId: string;
  replayed: boolean;
  message: Message;
};
export const REPORT_REASONS = [
  "SPAM",
  "HARASSMENT",
  "HATE",
  "SEXUAL_CONTENT",
  "THREAT",
  "OTHER",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export type Failure = {
  statusCode: number;
  code: string;
  message: string;
  retryAfterMs?: number;
};
export type Ack<T> = { ok: true; data: T } | { ok: false; error: Failure };
