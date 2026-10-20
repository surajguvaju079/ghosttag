import type {
  Failure,
  Ghost,
  History,
  Membership,
  Members,
  ReportReason,
  RoomDetails,
  Vibe,
} from "./contracts";
import { assertProductionEndpoints } from "./release-policy";

export class ApiError extends Error {
  readonly retryAt: number;
  constructor(readonly failure: Failure) {
    super(failure.code);
    this.retryAt = Date.now() + Math.max(0, failure.retryAfterMs ?? 0);
  }
}
export function asApiError(error: unknown): ApiError {
  return error instanceof ApiError
    ? error
    : new ApiError({
        statusCode: 0,
        code: "NETWORK_ERROR",
        message: "Connection unavailable",
      });
}
export function normalizeCode(value: string) {
  const code = value.trim().toUpperCase();
  if (!/^GH-\d{4}$/.test(code))
    throw new ApiError({
      statusCode: 400,
      code: "INVALID_ROOM_CODE",
      message: "Invalid room code",
    });
  return code;
}
export function configuration(
  apiValue?: string,
  socketValue?: string,
  production = process.env.EXPO_PUBLIC_APP_ENV === "production",
) {
  if (production) assertProductionEndpoints(apiValue, socketValue);
  if (!apiValue)
    throw new Error("Set EXPO_PUBLIC_API_URL before starting Expo.");
  const api = new URL(apiValue);
  const socket = new URL(socketValue || api.origin);
  if (
    ![api, socket].every(
      (url) =>
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash,
    )
  )
    throw new Error(
      "API URLs must be HTTP(S) URLs without credentials or query parameters.",
    );
  if (socket.pathname !== "/")
    throw new Error(
      "EXPO_PUBLIC_SOCKET_URL must be an origin without /api/v1 or /rooms.",
    );
  return {
    apiUrl: api.toString().replace(/\/$/, ""),
    socketUrl: socket.origin,
  };
}
const messages: Record<string, string> = {
  INVALID_ROOM_CODE: "Enter a room code like GH-4829.",
  ROOM_NOT_FOUND: "This room could not be found. Check the code.",
  ROOM_EXPIRED: "This moment has ended. Create a new room to keep talking.",
  ROOM_LOCKED: "This room is temporarily locked. Try again later.",
  ROOM_FULL: "This room has reached its 50-ghost limit.",
  ROOM_MEMBERSHIP_REQUIRED: "Join this room before entering.",
  ROOM_MEMBERSHIP_INACTIVE: "You left this room. Rejoin to continue.",
  INVALID_IDENTITY_CREDENTIAL: "Your anonymous session is no longer valid.",
  IDENTITY_EXPIRED: "Your anonymous session has expired.",
  IDENTITY_REVOKED: "Your anonymous session is no longer available.",
  AUTHENTICATION_REQUIRED: "Start a new anonymous session to continue.",
  NETWORK_ERROR:
    "We could not reach GhostTag. Check your connection and try again.",
  SEND_KEY_UNAVAILABLE: "Your device could not prepare the message. Try again.",
  ACK_TIMEOUT:
    "Confirmation did not arrive. Retry this message with the same send key.",
  MESSAGE_NOT_FOUND: "This message is no longer available.",
  INVALID_MESSAGE_PAYLOAD: "Send non-empty text, up to 2,000 characters.",
  INVALID_CURSOR: "History changed. Refresh the room to reload it.",
  RATE_LIMITED: "A little breather. Please wait before trying again.",
};
export function friendlyError(error: unknown, now?: number) {
  const parsed = asApiError(error);
  const failure = parsed.failure;
  const remaining =
    now === undefined
      ? failure.retryAfterMs
      : Math.max(0, parsed.retryAt - now);
  if (failure.code === "RATE_LIMITED" && now !== undefined && !remaining)
    return "You can try again now.";
  const wait = remaining
    ? ` Try again in ${Math.ceil(remaining / 1000)}s.`
    : "";
  return (
    (messages[failure.code] || "Something went wrong. Please try again.") + wait
  );
}

export class ApiClient {
  constructor(
    readonly baseUrl: string,
    private fetcher: typeof fetch = fetch,
    private unauthorized: (token: string) => void = () => {},
  ) {}
  async request<T>(
    path: string,
    token?: string,
    body?: unknown,
    method = "GET",
  ): Promise<T> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 15000);
    try {
      const fetcher = this.fetcher;
      const response = await fetcher(`${this.baseUrl}${path}`, {
        method,
        signal: abort.signal,
        cache: "no-store",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (response.status === 401 && token) this.unauthorized(token);
        throw new ApiError({
          statusCode: response.status,
          code: data.code || "REQUEST_FAILED",
          message: "Request failed",
          retryAfterMs:
            data.retryAfterMs ??
            (Number(response.headers.get("Retry-After")) * 1000 || undefined),
        });
      }
      return response.status === 204
        ? (undefined as T)
        : ((await response.json()) as T);
    } catch (error) {
      throw asApiError(error);
    } finally {
      clearTimeout(timer);
    }
  }
  async createIdentity() {
    const { token } = await this.request<{ token: string }>(
      "/identity",
      undefined,
      undefined,
      "POST",
    );
    if (!token) throw new Error("Invalid identity response");
    return token;
  }
  async validateIdentity(token: string) {
    await this.request("/identity/me", token);
  }
  async createRoom(token: string, vibe: Vibe, name: string) {
    // Select only public fields; legacy create currently also returns an internal UUID.
    const result = await this.request<{ code: string }>(
      "/rooms",
      token,
      { vibe, ...(name.trim() ? { name: name.trim() } : {}) },
      "POST",
    );
    return normalizeCode(result.code);
  }
  async joinRoom(token: string, value: string) {
    const code = normalizeCode(value);
    await this.request<{ membership: Ghost }>(
      `/rooms/${code}/join`,
      token,
      undefined,
      "POST",
    );
    return code;
  }
  details(token: string, code: string) {
    return this.request<RoomDetails>(`/rooms/${normalizeCode(code)}`, token);
  }
  members(token: string, code: string) {
    return this.request<Members>(
      `/rooms/${normalizeCode(code)}/members`,
      token,
    );
  }
  membership(token: string, code: string) {
    return this.request<{ membership: Membership }>(
      `/rooms/${normalizeCode(code)}/membership`,
      token,
    );
  }
  leave(token: string, code: string) {
    return this.request<void>(
      `/rooms/${normalizeCode(code)}/leave`,
      token,
      undefined,
      "POST",
    );
  }
  history(token: string, code: string, before?: string) {
    return this.request<History>(
      `/rooms/${normalizeCode(code)}/messages?limit=50${before ? `&before=${encodeURIComponent(before)}` : ""}`,
      token,
    );
  }
  report(token: string, code: string, messageId: string, reason: ReportReason) {
    return this.request<{ accepted: true }>(
      `/rooms/${normalizeCode(code)}/messages/${encodeURIComponent(messageId)}/reports`,
      token,
      { reason },
      "POST",
    );
  }
}
