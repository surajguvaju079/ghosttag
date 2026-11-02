export const inviteOrigin = "https://surajguvaju.com.np";
const codePattern = /^GH-\d{4}$/;
const idPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export type RoomInvite = { code: string; inviteId: string };
export function validInvite(code: string, inviteId: string): RoomInvite | null {
  return codePattern.test(code) && idPattern.test(inviteId)
    ? { code, inviteId: inviteId.toLowerCase() }
    : null;
}
export function inviteLink(code: string, inviteId: string) {
  const invite = validInvite(code, inviteId);
  if (!invite) throw new Error("Invalid room invite");
  return `${inviteOrigin}/ghosttag/join/${invite.code}/${invite.inviteId}`;
}
export function parseInvite(value: string): RoomInvite | null {
  try {
    const url = new URL(value, "ghosttag://app");
    if (url.username || url.password || url.search || url.hash) return null;
    let path = url.pathname;
    if (url.protocol === "https:") {
      if (url.origin !== inviteOrigin) return null;
    } else if (url.protocol === "ghosttag:") {
      if (url.hostname === "join") path = `/join${path}`;
      else if (url.hostname !== "app") return null;
    } else return null;
    const match = path.match(
      /^\/(?:ghosttag\/)?join\/(GH-\d{4})\/([a-fA-F0-9-]{36})\/?$/,
    );
    return match ? validInvite(match[1], match[2]) : null;
  } catch {
    return null;
  }
}
let pending: RoomInvite | null = null;
const listeners = new Set<() => void>();
export function subscribeInvite(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function pendingInvite() {
  return pending;
}
export function rememberInvite(invite: RoomInvite) {
  pending = invite;
  listeners.forEach((fn) => fn());
}
export function takeInvite() {
  const value = pending;
  pending = null;
  listeners.forEach((fn) => fn());
  return value;
}
