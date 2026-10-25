import type { Message } from "../api/contracts";
// Pages are authoritative newest-first sequences, even when ISO timestamps lose
// PostgreSQL sub-millisecond precision. Keep their order rather than re-sorting them.
export function unique(messages: Message[]): Message[] {
  const ids = new Set<string>();
  return messages.filter(
    (message) => !ids.has(message.messageId) && !!ids.add(message.messageId),
  );
}
export function mergeLive(current: Message[], incoming: Message): Message[] {
  if (current.some((message) => message.messageId === incoming.messageId))
    return current;
  const index = current.findIndex(
    (message) =>
      message.createdAt < incoming.createdAt ||
      (message.createdAt === incoming.createdAt &&
        message.messageId < incoming.messageId),
  );
  const result = [...current];
  result.splice(index === -1 ? result.length : index, 0, incoming);
  return result;
}
export function validText(text: string) {
  return (
    !!text.trim() &&
    text.length <= 2000 &&
    !text.includes("\u0000") &&
    !/[\uD800-\uDFFF]/u.test(text)
  );
}
