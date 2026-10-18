import { randomUUID } from 'node:crypto';
import { historyQuery, roomCode, sendPayload } from './message.validation';

describe('Messaging input contracts', () => {
  it('normalizes room codes', () =>
    expect(roomCode(' gh-1234 ')).toBe('GH-1234'));
  it.each([null, {}, 'GH-123', 'anything'])(
    'rejects invalid room codes (%p)',
    (value) => {
      expect(() => roomCode(value)).toThrow();
    },
  );
  it.each(['', '   ', 'x'.repeat(2001), null, 'null\u0000byte', '\ud800'])(
    'rejects invalid text',
    (text) => {
      expect(() =>
        sendPayload({ code: 'GH-1234', clientMessageId: randomUUID(), text }),
      ).toThrow();
    },
  );
  it('accepts exactly 2000 UTF-16 code units and normalizes UUID case', () => {
    const id = randomUUID();
    expect(
      sendPayload({
        code: 'GH-1234',
        clientMessageId: id.toUpperCase(),
        text: 'x'.repeat(2000),
      }),
    ).toEqual({ code: 'GH-1234', clientMessageId: id, text: 'x'.repeat(2000) });
  });
  it.each([
    { userId: 'untrusted' },
    { membershipId: 'untrusted' },
    { extra: true },
  ])('rejects extra send fields', (extra) => {
    expect(() =>
      sendPayload({
        code: 'GH-1234',
        clientMessageId: randomUUID(),
        text: 'hello',
        ...extra,
      }),
    ).toThrow();
  });
  it.each(['bad', '', undefined])(
    'requires a UUIDv4 retry key',
    (clientMessageId) => {
      expect(() =>
        sendPayload({ code: 'GH-1234', clientMessageId, text: 'hello' }),
      ).toThrow();
    },
  );
  it('defaults to 50 and accepts only opaque message cursors', () => {
    expect(historyQuery({})).toEqual({ limit: 50, before: undefined });
    expect(
      historyQuery({ limit: '100', before: 'm_' + 'a'.repeat(32) }),
    ).toEqual({ limit: 100, before: 'm_' + 'a'.repeat(32) });
  });
  it.each([
    { limit: '0' },
    { limit: '101' },
    { limit: ['1'] },
    { limit: '1.0' },
    { before: randomUUID() },
    { unknown: true },
  ])('rejects malformed pagination (%p)', (query) => {
    expect(() => historyQuery(query)).toThrow();
  });
});
