import { ApiClient, asApiError } from "../api/client";
import type { MatchState } from "../api/contracts";
export type QueueState = {
  data?: MatchState;
  busy: boolean;
  error?: unknown;
  retryAt: number;
};
export class MatchingQueue {
  state: QueueState = { busy: false, retryAt: 0 };
  private listeners = new Set<() => void>();
  private generation = 0;
  private active = false;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(
    private api: Pick<
      ApiClient,
      | "matchingState"
      | "startMatch"
      | "heartbeatMatch"
      | "cancelMatch"
      | "clearMatchBlocks"
    >,
    private token: string,
    private onMatched: (code: string) => void,
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.state;
  private patch(update: Partial<QueueState>) {
    this.state = { ...this.state, ...update };
    this.listeners.forEach((fn) => fn());
  }
  async resume() {
    this.active = true;
    await this.request(() => this.api.matchingState(this.token));
  }
  async start() {
    if (this.state.busy || Date.now() < this.state.retryAt) return;
    await this.request(() => this.api.startMatch(this.token), true);
  }
  async cancel() {
    const id = this.state.data?.search?.id;
    if (id)
      await this.request(() => this.api.cancelMatch(this.token, id), true);
  }
  async clearBlocks() {
    if (!this.state.busy && Date.now() >= this.state.retryAt)
      await this.request(() => this.api.clearMatchBlocks(this.token));
  }
  private async request(work: () => Promise<MatchState>, navigate = false) {
    clearTimeout(this.timer);
    const generation = ++this.generation;
    this.patch({ busy: true, error: undefined });
    try {
      const data = await work();
      if (!this.active || generation !== this.generation) {
        if (!this.active && data.status === "WAITING" && data.search)
          void this.api.cancelMatch(this.token, data.search.id).catch(() => {});
        return;
      }
      this.patch({ data, busy: false });
      if (navigate && data.session) this.onMatched(data.session.code);
    } catch (error) {
      if (this.active && generation === this.generation)
        this.patch({ busy: false, error, retryAt: asApiError(error).retryAt });
    } finally {
      if (
        this.active &&
        generation === this.generation &&
        this.state.data?.status === "WAITING"
      )
        this.schedule();
    }
  }
  private schedule() {
    const id = this.state.data?.search?.id;
    if (!id) return;
    this.timer = setTimeout(
      () => {
        if (this.active)
          void this.request(
            () => this.api.heartbeatMatch(this.token, id),
            true,
          );
      },
      Math.max(5000, this.state.retryAt - Date.now()),
    );
  }
  pause() {
    this.active = false;
    this.generation++;
    clearTimeout(this.timer);
    const id = this.state.data?.search?.id;
    if (id) void this.api.cancelMatch(this.token, id).catch(() => {});
    this.patch({ busy: false });
  }
}
