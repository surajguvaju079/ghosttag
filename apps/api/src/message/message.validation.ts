import { BadRequestException } from '@nestjs/common';
import type { ReactionType } from 'generated/prisma/client';

export const reactionTypes: ReactionType[] = [
  'FIRE',
  'LAUGH',
  'SHOCK',
  'MIND_BLOWN',
  'LIKE',
  'LOVE',
  'SAD',
  'ANGRY',
];

export function invalid(
  code = 'INVALID_MESSAGE_PAYLOAD',
  message = 'Invalid message payload',
): never {
  throw new BadRequestException({ code, message });
}

export function roomCode(value: unknown): string {
  if (typeof value !== 'string')
    invalid('INVALID_ROOM_CODE', 'Invalid room code');
  const code = value.trim().toUpperCase();
  if (!/^GH-\d{4}$/.test(code))
    invalid('INVALID_ROOM_CODE', 'Invalid room code');
  return code;
}

export function payload(
  value: unknown,
  keys: string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some((key) => !keys.includes(key))) invalid();
  return object;
}

export function sendPayload(value: unknown) {
  const object = payload(value, [
    'code',
    'text',
    'clientMessageId',
    'replyToMessageId',
  ]);
  const code = roomCode(object.code);
  const { text, clientMessageId } = object;
  if (
    typeof text !== 'string' ||
    !text.trim() ||
    text.length > 2000 ||
    text.includes('\u0000') ||
    /[\uD800-\uDFFF]/u.test(text)
  )
    invalid();
  if (
    typeof clientMessageId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      clientMessageId,
    )
  )
    invalid();
  const replyToMessageId = object.replyToMessageId;
  if (
    replyToMessageId !== undefined &&
    (typeof replyToMessageId !== 'string' ||
      !/^m_[0-9a-f]{32}$/.test(replyToMessageId))
  )
    invalid('INVALID_REPLY_TARGET', 'Invalid reply target');
  return {
    code,
    text,
    clientMessageId: clientMessageId.toLowerCase(),
    ...(replyToMessageId ? { replyToMessageId } : {}),
  };
}

export function voicePayload(
  codeValue: unknown,
  keyValue: unknown,
  durationValue: unknown,
  contentType: unknown,
  data: Buffer,
) {
  const code = roomCode(codeValue);
  if (
    typeof keyValue !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      keyValue,
    ) ||
    typeof durationValue !== 'string' ||
    !/^\d{1,10}$/.test(durationValue) ||
    Number(durationValue) < 1 ||
    Number(durationValue) > 2_147_483_647 ||
    contentType !== 'audio/mp4' ||
    data.length < 12 ||
    data.length > 5_242_880 ||
    data.toString('ascii', 4, 8) !== 'ftyp'
  )
    invalid('INVALID_VOICE_PAYLOAD', 'Invalid voice message');
  return {
    code,
    clientMessageId: keyValue.toLowerCase(),
    durationMs: Number(durationValue),
    data,
  };
}

export function reactionPayload(value: unknown) {
  const object = payload(value, ['code', 'messageId', 'type']);
  const code = roomCode(object.code);
  if (
    typeof object.messageId !== 'string' ||
    !/^m_[0-9a-f]{32}$/.test(object.messageId)
  )
    invalid('MESSAGE_NOT_FOUND', 'Message not found');
  if (!reactionTypes.includes(object.type as ReactionType))
    invalid('INVALID_REACTION', 'Invalid reaction');
  return {
    code,
    messageId: object.messageId,
    type: object.type as ReactionType,
  };
}

export function historyQuery(query: unknown) {
  const object = payload(query, ['limit', 'before']);
  const limit = object.limit === undefined ? 50 : Number(object.limit);
  if (
    typeof object.limit !== 'undefined' &&
    (typeof object.limit !== 'string' || !/^[1-9]\d{0,2}$/.test(object.limit))
  )
    invalid('INVALID_PAGINATION', 'Invalid pagination');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    invalid('INVALID_PAGINATION', 'Invalid pagination');
  const before = object.before;
  if (
    before !== undefined &&
    (typeof before !== 'string' || !/^m_[0-9a-f]{32}$/.test(before))
  )
    invalid('INVALID_CURSOR', 'Invalid message cursor');
  return { limit, before };
}
