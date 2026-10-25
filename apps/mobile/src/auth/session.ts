import { ApiError, asApiError } from "../api/client";
export interface CredentialStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}
export interface IdentityApi {
  createIdentity(): Promise<string>;
  validateIdentity(token: string): Promise<void>;
}
export type SessionState = {
  status: "loading" | "ready" | "error" | "invalid";
  token?: string;
  error?: unknown;
};
export class Session {
  state: SessionState = { status: "loading" };
  private pending?: Promise<void>;
  private generation = 0;
  private unstoredToken?: string;
  private validation?: Promise<void>;
  private listeners = new Set<() => void>();
  constructor(
    private store: CredentialStore,
    private api: IdentityApi,
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.state;
  private update(state: SessionState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  bootstrap = (): Promise<void> => {
    if (this.pending) return this.pending;
    if (
      this.state.error instanceof ApiError &&
      Date.now() < this.state.error.retryAt
    )
      return Promise.resolve();
    if (this.state.status === "ready" || this.state.status === "invalid")
      return Promise.resolve();
    const generation = this.generation;
    this.update({ status: "loading" });
    this.pending = (async () => {
      try {
        let token = await this.store.get();
        if (token) await this.api.validateIdentity(token);
        else {
          token = this.unstoredToken ?? (await this.api.createIdentity());
          this.unstoredToken = token;
          await this.store.set(token);
          this.unstoredToken = undefined;
        }
        if (generation === this.generation)
          this.update({ status: "ready", token });
      } catch (error) {
        if (generation !== this.generation) return;
        if (asApiError(error).failure.statusCode === 401) this.invalidate();
        else this.update({ status: "error", error });
      }
    })().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  };
  revalidate = (): Promise<void> => {
    if (this.validation) return this.validation;
    const { token, status } = this.state;
    if (status !== "ready" || !token) return Promise.resolve();
    const generation = this.generation;
    this.validation = this.api
      .validateIdentity(token)
      .catch((error) => {
        // Offline foregrounds retain the credential; operations still authorize server-side.
        if (
          generation === this.generation &&
          asApiError(error).failure.statusCode === 401
        )
          this.invalidate();
      })
      .finally(() => {
        this.validation = undefined;
      });
    return this.validation;
  };
  invalidateCredential = (token: string) => {
    // Ignore a late HTTP 401 from a credential replaced through Start fresh.
    if (this.state.token === token) this.invalidate();
  };
  invalidate = () => {
    this.generation++;
    this.update({ status: "invalid" });
  };
  async startFresh() {
    // Explicit action: never silently replace an identity and lose its memberships.
    await this.pending;
    try {
      await this.store.clear();
    } catch (error) {
      this.update({ status: "error", error });
      return;
    }
    this.generation++;
    this.unstoredToken = undefined;
    this.update({ status: "loading" });
    await this.bootstrap();
  }
}
