// Public projections of the existing backend contracts. Internal IDs are deliberately absent.
export type Vibe = "DEEP_TALK" | "CHAOS" | "RANT_ZONE" | "GAMER_LOBBY";
export type Role = "OWNER" | "MEMBER";
export type Ghost = { ghostName: string; ghostAvatar: string; role: Role };
export type Room = {
  kind: "GROUP" | "MATCHED";
  inviteId: string | null;
  discoverable: boolean;
  matchId: string | null;
  code: string;
  name: string | null;
  vibe: Vibe;
  createdAt: string;
  expiresAt: string;
  activeMemberCount: number;
  maxCapacity: number;
};
export type Member = Ghost & { participantId: string; joinedAt: string };
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
  voice?: { durationMs: number };
  createdAt: string;
  author: { participantId: string; ghostName: string; ghostAvatar: string };
  replyTo?: {
    messageId: string;
    text: string;
    author: { participantId: string; ghostName: string; ghostAvatar: string };
  };
  reactions?: { type: ReactionType; count: number; mine: boolean }[];
};
export const REACTIONS = [
  "FIRE",
  "LAUGH",
  "SHOCK",
  "MIND_BLOWN",
  "LIKE",
  "LOVE",
  "SAD",
  "ANGRY",
] as const;
export type ReactionType = (typeof REACTIONS)[number];
export type ReactionUpdate = {
  code: string;
  messageId: string;
  reactions: { type: ReactionType; count: number; mine: boolean }[];
};
export type History = { messages: Message[]; nextCursor: string | null };
export type PlaygroundToday = {
  date: string;
  topic: string;
  story: string;
  prompts: readonly string[];
  pulses: readonly { id: string; question: string; optionA: string; optionB: string }[];
};
export type Pulse = {
  code: string;
  pulseId: string;
  question: string;
  optionA: string;
  optionB: string;
  createdAt: string;
  expiresAt: string;
  myVote: "A" | "B" | null;
  results: { A: number; B: number } | null;
};
export type PulseList = { pulses: Pulse[] };
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
  "CHILD_SAFETY",
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

export type JoinedRoom = Pick<
  Room,
  "code" | "name" | "vibe" | "expiresAt" | "kind" | "inviteId" | "matchId"
> & {
  lockedUntil: string | null;
  membershipStatus: "ACTIVE" | "LEFT";
};
export type JoinedRooms = { rooms: JoinedRoom[] };
export type DiscoverRoom = Pick<
  Room,
  "code" | "inviteId" | "vibe" | "expiresAt" | "activeMemberCount"
>;
export type DiscoverRooms = {
  rooms: DiscoverRoom[];
  nextCursor: string | null;
};

export type IdentityStatus = {
  ageEligibility: {
    status: "REQUIRED" | "ELIGIBLE" | "INELIGIBLE";
    method: "DECLARED_DOB" | null;
    assessedAt: string | null;
    policyVersion: string;
  };
  socialAccessEnabled: boolean;
};
export const ageAccessCodes = [
  "AGE_SCREENING_REQUIRED",
  "AGE_INELIGIBLE",
  "SOCIAL_ACCESS_DISABLED",
];

export type MatchSession = {
  id: string;
  code: string;
  topic: string;
  expiresAt: string;
  extended: boolean;
  extensionRequested: boolean;
  partnerRequested: boolean;
};
export type MatchState = {
  status: "IDLE" | "WAITING" | "MATCHED";
  matchingEnabled: boolean;
  blockedCount: number;
  search: { id: string; topic: string; expiresAt: string; leaseUntil: string } | null;
  session: MatchSession | null;
};
