import { ApiClient, ApiError, asApiError, normalizeCode } from "../api/client";
import type {
  Failure,
  Members,
  Membership,
  Message,
  Participant,
  ReportReason,
  RoomDetails,
  SendResult,
  Subscription,
} from "../api/contracts";
import { mergeLive, unique, validText } from "../messaging/history";
import type { Transport } from "../messaging/transport";
export type PendingMessage = {
  key: string;
  text: string;
  sending: boolean;
  error?: unknown;
};
export type RoomState = {
  status:
    "loading" | "offline" | "recovering" | "ready" | "blocked" | "expired";
  details?: RoomDetails;
  members?: Members;
  membership?: Membership;
  participant?: Participant;
  messages: Message[];
  pending: PendingMessage[];
  nextCursor: string | null;
  loadingOlder: boolean;
  error?: ApiError;
  retryAt: number;
  sendRetryAt: number;
  reportRetryAt: number;
  notice?: string;
};
export class RoomSession {
  state: RoomState = {
    status: "loading",
    messages: [],
    pending: [],
    nextCursor: null,
    loadingOlder: false,
    retryAt: 0,
    sendRetryAt: 0,
    reportRetryAt: 0,
  };
  readonly code: string;
  private listeners = new Set<() => void>();
  private socket?: Transport;
  private epoch = 0;
  private active = false;
  private buffered: Message[] = [];
  private historyLoaded = false;
  private historyAnchor?: string;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempts = 0;
  private operation = false;
  constructor(
    private api: ApiClient,
    private token: string,
    code: string,
    private makeSocket: () => Transport,
    private uuid: () => string,
    private invalidateSession: () => void,
  ) {
    this.code = normalizeCode(code);
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.state;
  private patch(update: Partial<RoomState>) {
    this.state = { ...this.state, ...update };
    this.listeners.forEach((listener) => listener());
  }
  private current(epoch: number) {
    return this.active && this.epoch === epoch;
  }
  private stopSocket() {
    clearTimeout(this.reconnectTimer);
    this.epoch++;
    this.socket?.disconnect();
    this.socket = undefined;
    this.buffered = [];
  }
  private expired() {
    if (
      this.state.details &&
      Date.parse(this.state.details.room.expiresAt) <= Date.now()
    ) {
      this.expire();
      return true;
    }
    return this.state.status === "expired";
  }
  pause() {
    if (this.socket)
      void this.socket
        .request("room:unsubscribe", { code: this.code })
        .catch(() => {});
    this.active = false;
    this.stopSocket();
    this.patch({
      status: this.state.status === "expired" ? "expired" : "offline",
      pending: this.state.pending.map((item) => ({ ...item, sending: false })),
    });
  }
  dispose() {
    this.pause();
    this.listeners.clear();
    this.historyLoaded = false;
    this.historyAnchor = undefined;
    this.state = { ...this.state, messages: [], pending: [] };
  }
  expire(error?: ApiError) {
    this.active = false;
    this.stopSocket();
    this.patch({
      status: "expired",
      members: undefined,
      membership: undefined,
      participant: undefined,
      messages: [],
      pending: [],
      error:
        error ??
        new ApiError({
          statusCode: 410,
          code: "ROOM_EXPIRED",
          message: "Room expired",
        }),
    });
  }
  private fail(
    error: unknown,
    operation: "connection" | "send" | "report" = "connection",
  ) {
    const failure = asApiError(error);
    const { statusCode } = failure.failure;
    if (statusCode === 401) {
      this.stopSocket();
      this.patch({
        status: "blocked",
        members: undefined,
        membership: undefined,
        participant: undefined,
        messages: [],
        pending: [],
        error: failure,
      });
      this.invalidateSession();
      return;
    }
    if (
      statusCode === 410 ||
      (statusCode === 404 && failure.failure.code === "ROOM_NOT_FOUND")
    ) {
      this.expire(failure);
      return;
    }
    if ([403, 423].includes(statusCode)) {
      this.stopSocket();
      this.patch({
        status: "blocked",
        members: undefined,
        membership: undefined,
        participant: undefined,
        messages: [],
        pending: [],
        error: failure,
      });
      return;
    }
    const cooldown =
      operation === "send"
        ? "sendRetryAt"
        : operation === "report"
          ? "reportRetryAt"
          : "retryAt";
    this.patch({
      error: failure,
      [cooldown]: Math.max(this.state[cooldown], failure.retryAt),
    });
  }
  async start() {
    if (
      this.state.details &&
      Date.parse(this.state.details.room.expiresAt) <= Date.now()
    ) {
      this.expire();
      return;
    }
    if (this.state.status === "expired" || Date.now() < this.state.retryAt)
      return;
    this.active = true;
    this.stopSocket();
    const epoch = this.epoch;
    this.patch({
      status: this.state.details ? "recovering" : "loading",
      error: undefined,
      loadingOlder: false,
    });
    try {
      const [details, members, membership] = await Promise.all([
        this.api.details(this.token, this.code),
        this.api.members(this.token, this.code),
        this.api.membership(this.token, this.code),
      ]);
      if (!this.current(epoch)) return;
      if (Date.parse(details.room.expiresAt) <= Date.now()) {
        this.expire();
        return;
      }
      if (
        this.state.details &&
        this.state.details.room.createdAt !== details.room.createdAt
      ) {
        this.historyLoaded = false;
        this.historyAnchor = undefined;
        this.patch({
          messages: [],
          pending: [],
          nextCursor: null,
          participant: undefined,
        });
      }
      this.patch({ details, members, membership: membership.membership });
      const socket = this.makeSocket();
      this.socket = socket;
      socket.on("connect", () => {
        if (this.current(epoch)) void this.recover(epoch, socket);
      });
      socket.on("message:created", (message: Message) => {
        if (!this.current(epoch) || message.code !== this.code) return;
        if (this.state.status === "ready")
          this.patch({ messages: mergeLive(this.state.messages, message) });
        else if (this.state.status === "recovering")
          this.buffered.push(message);
      });
      socket.on(
        "room:invalidated",
        (event: { code: string; error: Failure }) => {
          if (this.current(epoch) && event.code === this.code) {
            this.fail(new ApiError(event.error));
            if (this.current(epoch)) this.disconnected();
          }
        },
      );
      socket.on("session:invalidated", (event: { error: Failure }) => {
        if (this.current(epoch)) {
          this.stopSocket();
          this.patch({
            status: "blocked",
            messages: [],
            pending: [],
            error: new ApiError(event.error),
          });
          this.invalidateSession();
        }
      });
      socket.on("disconnect", () => {
        if (this.current(epoch)) this.disconnected();
      });
      socket.on("connect_error", (error: { data?: Failure }) => {
        if (!this.current(epoch)) return;
        this.fail(error.data ? new ApiError(error.data) : error);
        if (this.current(epoch)) this.disconnected();
      });
      socket.connect();
    } catch (error) {
      if (!this.current(epoch)) return;
      this.patch({ status: "offline" });
      this.fail(error);
      if (this.current(epoch) && this.state.status === "offline")
        this.scheduleReconnect();
    }
  }
  private disconnected() {
    this.stopSocket();
    this.patch({
      status: "offline",
      pending: this.state.pending.map((item) => ({ ...item, sending: false })),
    });
    this.scheduleReconnect();
  }
  private scheduleReconnect() {
    if (!this.active) return;
    const delay = Math.max(
      this.state.retryAt - Date.now(),
      Math.min(30000, 1500 * 2 ** Math.min(this.reconnectAttempts++, 5)),
    );
    this.reconnectTimer = setTimeout(() => {
      void this.start();
    }, delay);
  }
  private async recover(epoch: number, socket: Transport) {
    this.patch({ status: "recovering" });
    try {
      const subscription = await socket.request<Subscription>(
        "room:subscribe",
        { code: this.code },
      );
      if (!this.current(epoch)) return;
      if (!subscription.subscribed) throw new Error("Subscription cancelled");
      const hadHistory = this.historyLoaded;
      const anchor = this.historyAnchor;
      const recovered: Message[] = [];
      let before: string | undefined;
      let next: string | null = null;
      const cursors = new Set<string>();
      do {
        const page = await this.api.history(this.token, this.code, before);
        if (!this.current(epoch)) return;
        recovered.push(...page.messages);
        next = page.nextCursor;
        if (
          !hadHistory ||
          (anchor &&
            page.messages.some((message) => message.messageId === anchor)) ||
          !next
        )
          break;
        if (cursors.has(next)) throw new Error("Repeated history cursor");
        cursors.add(next);
        before = next;
      } while (this.current(epoch));
      // Recovered server order wins; previous older history and buffered live events deduplicate.
      let messages = unique([...recovered, ...this.state.messages]);
      for (const message of this.buffered)
        messages = mergeLive(messages, message);
      this.buffered = [];
      this.historyLoaded = true;
      this.historyAnchor = recovered[0]?.messageId;
      this.reconnectAttempts = 0;
      this.patch({
        status: "ready",
        participant: subscription.participant,
        messages,
        nextCursor: hadHistory && next ? this.state.nextCursor : next,
        error: undefined,
      });
    } catch (error) {
      if (!this.current(epoch)) return;
      this.fail(error);
      if (this.current(epoch)) this.disconnected();
    }
  }
  async older() {
    if (this.expired()) return;
    if (
      this.state.loadingOlder ||
      !this.state.nextCursor ||
      this.state.status !== "ready" ||
      Date.now() < this.state.retryAt
    )
      return;
    const epoch = this.epoch;
    this.patch({ loadingOlder: true });
    try {
      const page = await this.api.history(
        this.token,
        this.code,
        this.state.nextCursor,
      );
      if (this.current(epoch))
        this.patch({
          messages: unique([...this.state.messages, ...page.messages]),
          nextCursor: page.nextCursor,
        });
    } catch (error) {
      if (this.current(epoch)) this.fail(error);
    } finally {
      if (this.current(epoch)) this.patch({ loadingOlder: false });
    }
  }
  async send(text: string, retryKey?: string) {
    if (this.expired()) return false;
    if (
      this.state.status !== "ready" ||
      !this.socket ||
      Date.now() < Math.max(this.state.retryAt, this.state.sendRetryAt)
    )
      return false;
    const retry = retryKey
      ? this.state.pending.find((item) => item.key === retryKey)
      : undefined;
    if (retryKey && (!retry || retry.sending)) return false;
    const exactText = retry ? retry.text : text;
    if (!validText(exactText)) {
      this.fail(
        new ApiError({
          statusCode: 400,
          code: "INVALID_MESSAGE_PAYLOAD",
          message: "Invalid text",
        }),
      );
      return false;
    }
    let key: string;
    try {
      key = retry?.key ?? this.uuid();
    } catch {
      this.fail(
        new ApiError({
          statusCode: 0,
          code: "SEND_KEY_UNAVAILABLE",
          message: "Could not prepare message",
        }),
        "send",
      );
      return false;
    }
    this.patch({
      pending: [
        ...this.state.pending.filter((item) => item.key !== key),
        { key, text: exactText, sending: true },
      ],
      error: undefined,
    });
    const epoch = this.epoch;
    try {
      const result = await this.socket.request<SendResult>("message:send", {
        code: this.code,
        clientMessageId: key,
        text: exactText,
      });
      if (this.current(epoch))
        this.patch({
          messages: mergeLive(this.state.messages, result.message),
          pending: this.state.pending.filter((item) => item.key !== key),
        });
    } catch (error) {
      if (this.current(epoch)) {
        this.patch({
          pending: this.state.pending.map((item) =>
            item.key === key ? { ...item, sending: false, error } : item,
          ),
        });
        this.fail(error, "send");
      }
    }
    return true;
  }
  async refreshMembers() {
    const epoch = this.epoch;
    try {
      const members = await this.api.members(this.token, this.code);
      if (this.current(epoch)) this.patch({ members });
    } catch (error) {
      if (this.current(epoch)) this.fail(error);
    }
  }
  async leave() {
    if (this.operation) return false;
    this.operation = true;
    this.pause();
    try {
      await this.api.leave(this.token, this.code);
      this.patch({ messages: [], pending: [] });
      return true;
    } catch (error) {
      this.fail(error);
      return false;
    } finally {
      this.operation = false;
    }
  }
  async rejoin() {
    if (this.operation || Date.now() < this.state.retryAt) return;
    this.operation = true;
    try {
      await this.api.joinRoom(this.token, this.code);
      await this.start();
    } catch (error) {
      this.fail(error);
    } finally {
      this.operation = false;
    }
  }
  async report(messageId: string, reason: ReportReason) {
    if (this.expired()) return false;
    if (
      this.state.status !== "ready" ||
      Date.now() < Math.max(this.state.retryAt, this.state.reportRetryAt)
    )
      return false;
    const epoch = this.epoch;
    this.patch({ notice: undefined, error: undefined });
    try {
      await this.api.report(this.token, this.code, messageId, reason);
      if (this.current(epoch))
        this.patch({
          notice: "Report received. Thank you for looking out for the room.",
        });
      return this.current(epoch);
    } catch (error) {
      if (this.current(epoch)) this.fail(error, "report");
      return false;
    }
  }
}
