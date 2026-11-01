import type { IdentityStatus } from "../api/contracts";
import { ApiError, asApiError } from "../api/client";
export interface CredentialStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}
export interface IdentityApi {
  createIdentity(): Promise<string>;
  validateIdentity(token: string): Promise<IdentityStatus>;
  assessAge?(token: string, dateOfBirth: string): Promise<IdentityStatus>;
}
export type SessionState = {
  status:
    | "loading"
    | "ready"
    | "error"
    | "invalid"
    | "screening"
    | "ineligible"
    | "unavailable";
  token?: string;
  error?: unknown;
  assessing?: boolean;
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
        if (!token) {
          token = this.unstoredToken ?? (await this.api.createIdentity());
          this.unstoredToken = token;
          await this.store.set(token);
          this.unstoredToken = undefined;
        }
        const identity = await this.api.validateIdentity(token);
        if (generation === this.generation) this.applyIdentity(token, identity);
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
    if (
      ["loading", "invalid"].includes(status) ||
      !token ||
      this.state.assessing
    )
      return Promise.resolve();
    const generation = this.generation;
    this.validation = this.api
      .validateIdentity(token)
      .then((identity) => {
        if (generation === this.generation) this.applyIdentity(token, identity);
      })
      .catch((error) => {
        // Offline foregrounds retain the credential; operations still authorize server-side.
        if (
          generation === this.generation &&
          asApiError(error).failure.statusCode === 401
        )
          this.invalidate();
        else if (
          generation === this.generation &&
          asApiError(error).failure.code === "ELIGIBILITY_UNAVAILABLE"
        )
          this.update({ status: "unavailable", token, error });
      })
      .finally(() => {
        this.validation = undefined;
      });
    return this.validation;
  };
  private applyIdentity(token: string, identity: IdentityStatus) {
    const status =
      identity.ageEligibility.status === "INELIGIBLE"
        ? "ineligible"
        : identity.ageEligibility.status === "REQUIRED"
          ? "screening"
          : identity.socialAccessEnabled
            ? "ready"
            : "unavailable";
    this.update({ status, token });
  }
  rejectAccess = (token: string, error: ApiError) => {
    if (this.state.token !== token) return;
    this.generation++;
    const status =
      error.failure.code === "AGE_INELIGIBLE"
        ? "ineligible"
        : error.failure.code === "SOCIAL_ACCESS_DISABLED"
          ? "unavailable"
          : "screening";
    this.update({ status, token, error });
  };
  async assessAge(dateOfBirth: string) {
    const { token, status, assessing, error } = this.state;
    if (
      !token ||
      status !== "screening" ||
      assessing ||
      !this.api.assessAge ||
      (error instanceof ApiError && Date.now() < error.retryAt)
    )
      return;
    const generation = ++this.generation;
    this.update({ status: "screening", token, assessing: true });
    try {
      const identity = await this.api.assessAge(token, dateOfBirth);
      if (generation === this.generation) this.applyIdentity(token, identity);
    } catch (error) {
      if (generation !== this.generation) return;
      if (asApiError(error).failure.statusCode === 401) this.invalidate();
      else this.update({ status: "screening", token, error });
    }
  }
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
