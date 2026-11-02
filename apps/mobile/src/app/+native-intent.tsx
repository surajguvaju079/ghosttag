import { parseInvite, rememberInvite } from "../linking/invites";
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    const invite = parseInvite(path);
    if (invite) {
      rememberInvite(invite);
      return `/join/${invite.code}/${invite.inviteId}`;
    }
    if (
      path.startsWith("/") &&
      !path.startsWith("//") &&
      !/^\/(?:ghosttag\/)?join(?:\/|$)/.test(path)
    )
      return path;
    const url = new URL(path);
    if (
      url.protocol === "ghosttag:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.hostname === "room" &&
      /^\/GH-\d{4}$/.test(url.pathname)
    )
      return `/room${url.pathname}`;
    return "/";
  } catch {
    return "/";
  }
}
